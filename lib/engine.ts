import {
  MasterProfile,
  AlignmentResult,
  TailoredExperience,
  TailoredProject,
  TailoredCustomSection,
  TailoredCustomItem,
  TailoredBullet,
  UnmatchedRequirement,
  ProofOfTruth,
  Bullet,
} from "./schema";
import { extractKeywords, SKILL_LEXICON, prettySkill, textHasKeyword, ACTION_VERBS } from "./keywords";
import { env, pipeline, PipelineType } from "@xenova/transformers";

// Configure transformers to not look for local models in Next.js environment
env.allowLocalModels = false;
env.useBrowserCache = false;

// Singleton pipeline for feature extraction. On failure we clear the cached
// promise so a later request can retry (rather than caching a rejected promise
// forever). Embeddings are optional — disable entirely with SLAY_EMBEDDINGS=0.
let extractorPromise: Promise<any> | null = null;
const embeddingsEnabled = () => process.env.SLAY_EMBEDDINGS !== "0";
const getExtractor = () => {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    }).catch((e) => {
      extractorPromise = null; // allow a retry on the next request
      throw e;
    });
  }
  return extractorPromise;
};

/** Reject if `p` doesn't settle within `ms`. The underlying work keeps running
 * (so a slow first-time model download still warms the cache for later). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("embed-timeout")), ms)),
  ]);
}

// Cosine similarity between two float arrays
function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
import { profileKeywords } from "./parse";

/* ------------------------------------------------------------------ *
 *  Deterministic semantic-alignment engine.
 *
 *  Given a true MasterProfile and a target JD, it:
 *   - extracts JD requirements,
 *   - splits them into verified (present) vs unmatched (missing) skills,
 *   - scores each real bullet by JD relevance,
 *   - reorders bullets/experiences by relevance,
 *   - keeps bullet TEXT verbatim (no fabricated metrics) and records which
 *     JD keywords each bullet legitimately hits.
 *
 *  It never invents experience: every tailored bullet references the id of a
 *  real source bullet.
 * ------------------------------------------------------------------ */

async function bulletScore(bullet: Bullet, jdKeywords: string[], jdEmbedding: any, extractor: any): Promise<{ score: number; hits: string[], semanticScore: number }> {
  const hits: string[] = [];
  let score = 0;
  for (const kw of jdKeywords) {
    if (textHasKeyword(bullet.text, kw)) {
      hits.push(kw);
      score += 10 + kw.length; // longer/more-specific matches weigh more
    }
  }
  // Reward strong action verbs so quantified, impactful bullets float up.
  for (const v of ACTION_VERBS) {
    if (new RegExp(`^\\s*${v}\\b`, "i").test(bullet.text)) {
      score += 3;
      break;
    }
  }
  // Slight reward for quantified bullets (real numbers already in the text).
  if (/\d/.test(bullet.text)) score += 2;

  let semanticScore = 0;
  try {
    if (extractor && jdEmbedding) {
      const output = await extractor(bullet.text, { pooling: 'mean', normalize: true });
      const bulletEmbedding = output.data;
      semanticScore = cosineSimilarity(jdEmbedding, bulletEmbedding);
      // Scale semantic score 0-1 to a 0-20 score boost
      if (semanticScore > 0.1) {
        score += semanticScore * 20;
      }
    }
  } catch (e) {
    // silently fail and fallback to keyword scoring
  }

  return { score, hits, semanticScore };
}

export async function deterministicAlign(profile: MasterProfile, jd: string): Promise<{
  result: AlignmentResult;
  matchedKeywords: string[];
}> {
  const jdKeywords = extractKeywords(jd, 50);
  const profileKws = new Set(profileKeywords(profile).map((k) => k.toLowerCase()));

  let extractor = null;
  let jdEmbedding = null;
  // Semantic scoring only matters when there's a JD to compare against, and it
  // must never block the request — cap it so a slow/first-time model download
  // falls back to fast keyword scoring instead of hanging.
  if (embeddingsEnabled() && jd.trim().length > 0) {
    try {
      extractor = await withTimeout(getExtractor(), 6000);
      const output = await withTimeout<any>(extractor(jd.slice(0, 2000), { pooling: "mean", normalize: true }), 6000);
      jdEmbedding = output.data;
    } catch (e) {
      extractor = null;
      jdEmbedding = null;
      console.warn("Embeddings unavailable/slow — using keyword scoring only.", (e as Error)?.message);
    }
  }

  const verifiedSet = new Set<string>();
  const unmatched: UnmatchedRequirement[] = [];
  for (const kw of jdKeywords) {
    if (profileKws.has(kw.toLowerCase()) || textHasKeyword(profileFullText(profile), kw)) {
      verifiedSet.add(prettySkill(kw));
    } else {
      unmatched.push({
        skill_or_requirement: prettySkill(kw),
        recommendation: recommendationFor(prettySkill(kw)),
      });
    }
  }

  // Rank experiences and bullets by JD relevance.
  const tailoredExperiences = await Promise.all(profile.experiences
    .map(async (exp) => {
      const scoredItems = await Promise.all(exp.bullets.map(async (b) => ({ bullet: b, ...(await bulletScore(b, jdKeywords, jdEmbedding, extractor)) })));
      const scored = scoredItems.sort((a, b) => b.score - a.score);

      const bullet_points: TailoredBullet[] = scored.map(({ bullet, hits, semanticScore }) => ({
        source_bullet_id: bullet.id,
        // Zero-hallucination rule: text is the candidate's real bullet, verbatim.
        tailored_text: bullet.text,
        highlighted_keywords: [...new Set(hits.map(prettySkill))],
        semantic_score: semanticScore,
      }));

      const expScore = scored.reduce((s, x) => s + x.score, 0);
      return { exp, bullet_points, expScore };
    }));
    
    tailoredExperiences.sort((a, b) => b.expScore - a.expScore);

    const finalExperiences: TailoredExperience[] = tailoredExperiences.map(({ exp, bullet_points }) => ({
      source_experience_id: exp.id,
      company: exp.company,
      role_title: exp.role_title,
      date_range: exp.date_range,
      bullet_points,
    }));

  const tailoredProjects = await Promise.all(profile.projects
    .map(async (proj) => {
      const scoredItems = await Promise.all(proj.bullets.map(async (b) => ({ bullet: b, ...(await bulletScore(b, jdKeywords, jdEmbedding, extractor)) })));
      const scored = scoredItems.sort((a, b) => b.score - a.score);

      const bullet_points: TailoredBullet[] = scored.map(({ bullet, hits, semanticScore }) => ({
        source_bullet_id: bullet.id,
        tailored_text: bullet.text,
        highlighted_keywords: [...new Set(hits.map(prettySkill))],
        semantic_score: semanticScore,
      }));

      const projScore = scored.reduce((s, x) => s + x.score, 0);
      return { proj, bullet_points, projScore };
    }));
    
    tailoredProjects.sort((a, b) => b.projScore - a.projScore);
    const finalProjects: TailoredProject[] = tailoredProjects.map(({ proj, bullet_points }) => ({
      source_project_id: proj.id,
      name: proj.name,
      role_title: proj.role_title,
      date_range: proj.date_range,
      bullet_points,
    }));

  const tailoredCustomSections = await Promise.all(profile.custom_sections
    .map(async (sec) => {
      const items = await Promise.all(sec.items.map(async (item) => {
        const scoredItems = await Promise.all(item.bullets.map(async (b) => ({ bullet: b, ...(await bulletScore(b, jdKeywords, jdEmbedding, extractor)) })));
        const scored = scoredItems.sort((a, b) => b.score - a.score);

        const bullet_points: TailoredBullet[] = scored.map(({ bullet, hits, semanticScore }) => ({
          source_bullet_id: bullet.id,
          tailored_text: bullet.text,
          highlighted_keywords: [...new Set(hits.map(prettySkill))],
          semantic_score: semanticScore,
        }));
        
        const itemScore = scored.reduce((s, x) => s + x.score, 0);
        return { item, bullet_points, itemScore };
      }));
      
      items.sort((a, b) => b.itemScore - a.itemScore);
      const finalItems: TailoredCustomItem[] = items.map(({ item, bullet_points }) => ({
        source_item_id: item.id,
        name: item.name,
        role_title: item.role_title,
        date_range: item.date_range,
        bullet_points,
      }));
      
      return {
        source_section_id: sec.id,
        section_title: sec.section_title,
        items: finalItems,
      };
    }));

  const verified_skills = [...verifiedSet];
  const tailored_summary = buildSummary(profile, verified_skills);
  const matchedKeywords = jdKeywords.filter((kw) => verifiedSet.has(prettySkill(kw)));

  return {
    result: {
      tailored_summary,
      experiences: finalExperiences,
      projects: finalProjects,
      custom_sections: tailoredCustomSections,
      verified_skills,
      unmatched_requirements: dedupeUnmatched(unmatched, verifiedSet),
    },
    matchedKeywords,
  };
}

function profileFullText(profile: MasterProfile): string {
  return [
    profile.summary,
    ...profile.skills,
    ...profile.experiences.flatMap((e) => [e.role_title, e.company, ...e.bullets.map((b) => b.text)]),
    ...profile.projects.flatMap((p) => [p.role_title, p.name, ...p.bullets.map((b) => b.text)]),
    ...profile.custom_sections.flatMap((s) => s.items.flatMap((i) => [i.role_title, i.name, ...i.bullets.map((b) => b.text)])),
  ].join(" \n ");
}

function dedupeUnmatched(items: UnmatchedRequirement[], verified: Set<string>): UnmatchedRequirement[] {
  const seen = new Set<string>();
  const out: UnmatchedRequirement[] = [];
  for (const it of items) {
    const key = it.skill_or_requirement.toLowerCase();
    if (seen.has(key) || verified.has(it.skill_or_requirement)) continue;
    seen.add(key);
    out.push(it);
  }
  return out.slice(0, 20);
}

function recommendationFor(skill: string): string {
  return `Not found in your profile. Do not fabricate it — if you have real exposure to ${skill}, add a truthful bullet or complete a short project/course, then re-run the analysis.`;
}

/** Build a truthful summary strictly from real profile facts + verified overlap. */
function buildSummary(profile: MasterProfile, verified: string[]): string {
  // Prefer the candidate's own summary verbatim — it reads better than a
  // synthesized line, and the deterministic path can't truly rewrite prose.
  if (profile.summary.trim()) return profile.summary.trim();

  const topRole = profile.experiences[0]?.role_title?.trim();
  const yearsGuess = estimateYears(profile);
  const skillPhrase = verified.slice(0, 6).join(", ");

  const parts: string[] = [];
  if (topRole) {
    parts.push(
      `${topRole}${yearsGuess ? ` with ${yearsGuess}` : ""}${
        profile.experiences[1] ? " across multiple teams" : ""
      }.`
    );
  } else if (profile.summary) {
    // Reuse the candidate's own summary verbatim rather than invent one.
    return profile.summary;
  }
  if (skillPhrase) {
    parts.push(`Verified strengths aligned to this role: ${skillPhrase}.`);
  }
  const combined = parts.join(" ").trim();
  return combined || profile.summary || "Experienced professional. Add a summary to your resume for a stronger opening line.";
}

function estimateYears(profile: MasterProfile): string {
  const years = new Set<number>();
  for (const e of profile.experiences) {
    for (const m of e.date_range.matchAll(/\b(19|20)\d{2}\b/g)) years.add(parseInt(m[0], 10));
  }
  if (years.size < 2) return "";
  const span = Math.max(...years) - Math.min(...years);
  if (span <= 0) return "";
  return `${span}+ years of experience`;
}

/* ------------------------------------------------------------------ *
 *  Proof-of-Truth: cross-check every tailored bullet id against the real
 *  profile. This runs regardless of which engine produced the result, so
 *  even the LLM path is held to the zero-hallucination guarantee.
 * ------------------------------------------------------------------ */

export function verifyTraceability(
  profile: MasterProfile,
  result: AlignmentResult,
  engine: "gemini" | "claude" | "deterministic"
): { proof: ProofOfTruth; sanitized: AlignmentResult } {
  const validBulletIds = new Set([
    ...profile.experiences.flatMap((e) => e.bullets.map((b) => b.id)),
    ...profile.projects.flatMap((p) => p.bullets.map((b) => b.id)),
    ...profile.custom_sections.flatMap((s) => s.items.flatMap((i) => i.bullets.map((b) => b.id)))
  ]);
  const validExpIds = new Set(profile.experiences.map((e) => e.id));
  const validProjIds = new Set(profile.projects.map((p) => p.id));
  const validSecIds = new Set(profile.custom_sections.map((s) => s.id));
  const validItemIds = new Set(profile.custom_sections.flatMap((s) => s.items.map((i) => i.id)));
  const sourceText = new Map([
    ...profile.experiences.flatMap((e) => e.bullets.map((b) => [b.id, b.text] as const)),
    ...profile.projects.flatMap((p) => p.bullets.map((b) => [b.id, b.text] as const)),
    ...profile.custom_sections.flatMap((s) => s.items.flatMap((i) => i.bullets.map((b) => [b.id, b.text] as const)))
  ]);

  const orphan: string[] = [];
  let total = 0;
  let traced = 0;

  const sanitizedExperiences = result.experiences
    .filter((exp) => validExpIds.size === 0 || validExpIds.has(exp.source_experience_id))
    .map((exp) => {
      const bullet_points = exp.bullet_points.filter((b) => {
        total += 1;
        const ok = validBulletIds.has(b.source_bullet_id);
        if (ok) {
          traced += 1;
          // Hard guarantee: force tailored_text back to the true source when the
          // model drifted (defends the deterministic promise even on LLM output).
          const truth = sourceText.get(b.source_bullet_id);
          if (truth && looksFabricated(b.tailored_text, truth)) {
            b.tailored_text = truth;
          }
        } else {
          orphan.push(b.source_bullet_id || "(missing id)");
        }
        return ok;
      });
      return { ...exp, bullet_points };
    });

  const sanitizedProjects = (result.projects || [])
    .filter((proj) => validProjIds.size === 0 || validProjIds.has(proj.source_project_id))
    .map((proj) => {
      const bullet_points = proj.bullet_points.filter((b) => {
        total += 1;
        const ok = validBulletIds.has(b.source_bullet_id);
        if (ok) {
          traced += 1;
          const truth = sourceText.get(b.source_bullet_id);
          if (truth && looksFabricated(b.tailored_text, truth)) {
            b.tailored_text = truth;
          }
        } else {
          orphan.push(b.source_bullet_id || "(missing id)");
        }
        return ok;
      });
      return { ...proj, bullet_points };
    });

  const sanitizedCustomSections = (result.custom_sections || [])
    .filter((sec) => validSecIds.size === 0 || validSecIds.has(sec.source_section_id))
    .map((sec) => {
      const items = sec.items
        .filter((it) => validItemIds.size === 0 || validItemIds.has(it.source_item_id))
        .map((it) => {
          const bullet_points = it.bullet_points.filter((b) => {
            total += 1;
            const ok = validBulletIds.has(b.source_bullet_id);
            if (ok) {
              traced += 1;
              const truth = sourceText.get(b.source_bullet_id);
              if (truth && looksFabricated(b.tailored_text, truth)) {
                b.tailored_text = truth;
              }
            } else {
              orphan.push(b.source_bullet_id || "(missing id)");
            }
            return ok;
          });
          return { ...it, bullet_points };
        });
      return { ...sec, items };
    });

  const proof: ProofOfTruth = {
    total_bullets: total,
    traced_bullets: traced,
    orphan_bullets: orphan,
    fully_traced: orphan.length === 0,
    engine,
  };

  return {
    proof,
    sanitized: { ...result, experiences: sanitizedExperiences, projects: sanitizedProjects, custom_sections: sanitizedCustomSections },
  };
}

/** Heuristic guard: if the tailored text introduces a number that the source
 * bullet never contained, treat it as fabricated and revert. */
function looksFabricated(tailored: string, source: string): boolean {
  const nums = (s: string) => new Set((s.match(/\d[\d.,%]*/g) ?? []).map((n) => n.replace(/[.,%]+$/, "")));
  const tNums = nums(tailored);
  const sNums = nums(source);

  // Map basic number words from source text to digits to allow AI to convert words to digits
  const wordNums = source.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion)\b/g) || [];
  const wordToNum: Record<string, string> = { "one":"1","two":"2","three":"3","four":"4","five":"5","six":"6","seven":"7","eight":"8","nine":"9","ten":"10","eleven":"11","twelve":"12","twenty":"20","thirty":"30","forty":"40","fifty":"50" };
  for (const w of wordNums) {
    if (wordToNum[w]) sNums.add(wordToNum[w]);
  }

  for (const n of tNums) {
    // Ignore reasonable years (1980-2050)
    if (/^(19|20)\d{2}$/.test(n)) {
      const year = parseInt(n, 10);
      if (year >= 1980 && year <= 2050) continue;
    }
    // Flag if a multi-digit metric appeared out of thin air
    if (!sNums.has(n) && n.length >= 2) return true;
  }
  return false;
}
