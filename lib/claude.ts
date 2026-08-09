import Anthropic from "@anthropic-ai/sdk";
import {
  MasterProfile,
  AlignmentResult,
  AlignmentResultSchema,
  ALIGNMENT_JSON_SCHEMA,
  SLAY_SYSTEM_PROMPT,
} from "./schema";

const MODEL = process.env.SLAY_MODEL || "claude-opus-5";

export function claudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Semantic alignment via Claude with JSON-schema structured-output enforcement.
 * Only sends the real profile + JD; the strict system prompt + schema forbid
 * fabrication, and the caller still runs verifyTraceability() on the result so
 * any drift is caught and reverted. Throws on any failure so the route can fall
 * back to the deterministic engine.
 */
export async function alignWithClaude(
  profile: MasterProfile,
  jd: string
): Promise<AlignmentResult> {
  const client = new Anthropic();

  const userPayload: any = {
    instruction: jd
      ? `You are an elite career coach. Dramatically rewrite the candidate's REAL summary, experience, and projects to perfectly align with the target job description. Use highly impactful action verbs, compelling phrasing, and flawless grammar to make the sentences professional and ATS-optimized. 

You must output:
      - tailored_summary: a powerful, concise professional summary. Do not just copy the input.
      - experiences: an array of user experiences
      - projects: an array of user projects
      - custom_sections: an array of arbitrary sections
      - verified_skills: curate, order, and perfectly capitalize the candidate's skills for maximum ATS impact. Do not just copy the input verbatim; select the most relevant ones.
      - unmatched_requirements: array of objects with skill_or_requirement and recommendation

You must adhere to the following ZERO-HALLUCINATION rules: 1. Do NOT invent new experiences, projects, custom sections, or bullets. 2. Every tailored experience must include a "source_experience_id" matching the input. 3. Every tailored project must include a "source_project_id" matching the input. 4. Every tailored custom section must include a "source_section_id", and its items must include "source_item_id", matching the input. 5. Every bullet point you return MUST include a "source_bullet_id" from the input. 6. Do NOT fabricate facts, numbers, metrics, or technologies that are not explicitly present in the source text. You MUST rewrite and heavily enhance the grammar and phrasing, but the core fact must remain identically true.`
      : `You are an elite career coach. Dramatically rewrite and enhance the grammar, clarity, and impact of the candidate's REAL summary, experience, and projects to make it highly professional and ATS-friendly. Use powerful action verbs and compelling narratives. 

You must output:
      - tailored_summary: a powerful, concise professional summary. Do not just copy the input.
      - experiences: an array of user experiences
      - projects: an array of user projects
      - custom_sections: an array of arbitrary sections
      - verified_skills: curate, order, and perfectly capitalize the candidate's skills for maximum ATS impact. Do not just copy the input verbatim; select and format the best ones.
      - unmatched_requirements: leave empty since there is no target JD

You must adhere to the following ZERO-HALLUCINATION rules: 1. Do NOT invent new experiences, projects, custom sections, or bullets. 2. Every tailored experience must include a "source_experience_id" matching the input. 3. Every tailored project must include a "source_project_id" matching the input. 4. Every tailored custom section must include a "source_section_id", and its items must include "source_item_id", matching the input. 5. Every bullet point you return MUST include a "source_bullet_id" from the input. 6. Do NOT fabricate facts, numbers, metrics, or technologies that are not explicitly present in the source text. You MUST rewrite and heavily enhance the grammar and phrasing, but the core fact must remain identically true.`,
    candidate_master_profile: profile,
  };
  if (jd) {
    userPayload.target_job_description = jd;
  }

  const params = {
    model: MODEL,
    max_tokens: 8000,
    system: SLAY_SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: ALIGNMENT_JSON_SCHEMA,
      },
    },
    messages: [
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const response = await client.messages.create(params);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const json = JSON.parse(extractJson(text));
  return AlignmentResultSchema.parse(json);
}

/** Structured outputs return clean JSON, but be defensive about stray prose. */
function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
