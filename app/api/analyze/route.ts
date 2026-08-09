import { NextRequest, NextResponse } from "next/server";
import { MasterProfileSchema, AnalyzeResponse } from "@/lib/schema";
import { deterministicAlign, verifyTraceability } from "@/lib/engine";
import { alignWithGemini, geminiAvailable } from "@/lib/gemini";
import { alignWithClaude, claudeAvailable } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 2 — Target Job Alignment & Semantic Gap Analysis.
 * Body: { profile: MasterProfile, jd: string }
 * Returns the tailored AlignmentResult plus Proof-of-Truth metadata.
 *
 * Engine selection (first available wins): Gemini (GEMINI_API_KEY) → Claude
 * (ANTHROPIC_API_KEY) → deterministic. The LLM paths run under strict
 * JSON-schema structured outputs; on any failure they fall back to the
 * deterministic engine. Either way, verifyTraceability() enforces that 100% of
 * tailored bullets map back to a real source id.
 */
/** Turn a raw provider error string into a short, actionable reason. */
function humanizeEngineError(err: string): string {
  if (/API key not valid|API_KEY_INVALID|invalid[_\s]?api[_\s]?key|invalid x-api-key|401/i.test(err))
    return "your API key is invalid.";
  if (/quota|RESOURCE_EXHAUSTED|rate.?limit|429/i.test(err)) return "the AI quota / rate limit was hit.";
  if (/PERMISSION_DENIED|403|not enabled|disabled/i.test(err))
    return "the key lacks access (enable the Generative Language API for it).";
  if (/model|not found|404/i.test(err)) return "the configured model is unavailable.";
  if (/Empty Gemini response|truncated|blocked|SAFETY/i.test(err)) return "the response was empty or blocked.";
  return "the AI service returned an error.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = MasterProfileSchema.parse(body?.profile);
    const jd = typeof body?.jd === "string" ? body.jd : "";

    if (profile.experiences.length === 0 && profile.skills.length === 0) {
      return NextResponse.json({ error: "Your profile is empty. Upload or paste a resume first." }, { status: 400 });
    }

    // Deterministic result is always computed — it supplies the keyword heatmap
    // and is the guaranteed fallback.
    const deterministic = await deterministicAlign(profile, jd);

    let engine: "gemini" | "claude" | "deterministic" = "deterministic";
    let result = deterministic.result;
    let warning: string | null = null;

    let geminiAttempted = false;
    let geminiFailed = false;

    if (geminiAvailable()) {
      geminiAttempted = true;
      try {
        result = await alignWithGemini(profile, jd);
        engine = "gemini";
      } catch (e) {
        console.error("[analyze] Gemini failed, attempting fallback...", e);
        geminiFailed = true;
        warning = `Gemini tailoring failed — ${humanizeEngineError(String(e))} `;
      }
    }

    if (engine === "deterministic" && claudeAvailable()) {
      try {
        result = await alignWithClaude(profile, jd);
        engine = "claude";
        warning = geminiFailed ? warning + "Fell back to Claude successfully." : null;
      } catch (e) {
        console.error("[analyze] Claude failed, falling back to deterministic:", e);
        const claudeWarning = `Claude tailoring failed — ${humanizeEngineError(String(e))} `;
        warning = (geminiFailed ? warning : "") + claudeWarning + "Showing a basic keyword reorder. Fix the key and re-run for full rewrites.";
      }
    }

    if (engine === "deterministic" && !geminiAttempted && !claudeAvailable()) {
      warning = "No AI key configured, so this is a basic keyword reorder (bullets unchanged). Add a valid GEMINI_API_KEY to .env for full AI rewrites.";
    }

    if (engine === "deterministic" && (geminiFailed || claudeAvailable())) {
      if (!warning?.includes("keyword reorder")) {
         warning = (warning || "") + "Showing a basic keyword reorder. Fix the key and re-run for full rewrites.";
      }
    }

    const { proof, sanitized } = verifyTraceability(profile, result, engine);

    const payload: AnalyzeResponse = {
      result: sanitized,
      proof,
      matched_keywords: deterministic.matchedKeywords,
      warning,
    };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown analysis error.";
    return NextResponse.json({ error: `Failed to analyze: ${message}` }, { status: 500 });
  }
}
