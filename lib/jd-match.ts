import { extractKeywords, textHasKeyword, prettySkill } from "./keywords";
import type { AlignmentResult, MasterProfile } from "./schema";
import type { LayoutBlock } from "./pdf-layout";

/* Deterministic JD ↔ resume match score. Pure (no node deps) so it runs on the
 * client too. Extracts the salient skills/keywords from the JD, then checks how
 * many appear anywhere in the finished resume text. */

export interface JdMatch {
  pct: number;
  matched: string[];
  missing: string[];
  total: number;
}

export function computeJdMatch(jd: string, resumeText: string): JdMatch {
  const keys = extractKeywords(jd, 40);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    (textHasKeyword(resumeText, k) ? matched : missing).push(prettySkill(k));
  }
  const total = keys.length;
  return {
    pct: total ? Math.round((matched.length / total) * 100) : 0,
    matched,
    missing,
    total,
  };
}

/** Flatten a tailored (template) result + profile into plain text for matching. */
export function templateResumeText(profile: MasterProfile, result: AlignmentResult): string {
  const parts: string[] = [result.tailored_summary, ...(result.verified_skills || [])];
  for (const e of result.experiences) parts.push(e.role_title, e.company, ...e.bullet_points.map((b) => b.tailored_text));
  for (const p of result.projects) parts.push(p.role_title, p.name, ...p.bullet_points.map((b) => b.tailored_text));
  for (const s of result.custom_sections)
    for (const it of s.items) parts.push(it.role_title, it.name, ...it.bullet_points.map((b) => b.tailored_text));
  for (const ed of profile.education) parts.push(ed.institution, ed.degree);
  return parts.filter(Boolean).join(" \n ");
}

/** Flatten reconstructed upload blocks into plain text for matching. */
export function uploadResumeText(blocks: LayoutBlock[]): string {
  return blocks.map((b) => b.text).join(" \n ");
}
