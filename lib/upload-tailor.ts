import { GoogleGenAI, Type } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { geminiAvailable } from "./gemini";
import { claudeAvailable } from "./claude";

/* ------------------------------------------------------------------ *
 *  Upload tailoring — rewrites the *wording* of an uploaded resume's
 *  body text (bullets/paragraphs) to a JD or for grammar, WITHOUT
 *  touching layout. Only "body" blocks are sent; names, headings, and
 *  contact lines are preserved verbatim. Rewrites are length-capped so
 *  the reconstructed layout stays intact.
 * ------------------------------------------------------------------ */

export interface TailorBlockInput {
  id: string;
  text: string;
}

const RULES = `STRICT RULES:
- Preserve every real fact: do NOT invent or change numbers, metrics, dates, company names, titles, or technologies. Only improve wording.
- Keep each rewrite within roughly the same length as the original (±15%) so the page layout is preserved.
- Tone: Write in a grounded, professional, human voice. Avoid fluff and empty adjectives. Focus on the action and the impact.
- BANNED WORDS: Do not use "spearheaded", "orchestrated", "synergized", "transformative", "elevated", "fostered", "seamlessly", or "pivotal". Use straightforward industry verbs.
- Return EVERY id you were given, even if the text is unchanged.
- Do not add or remove bullet markers; return only the sentence text.`;

function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    blocks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { id: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ["id", "text"],
        propertyOrdering: ["id", "text"],
      },
    },
  },
  required: ["blocks"],
};

function buildInstruction(jd: string, mode: "jd" | "grammar"): string {
  if (mode === "jd" && jd.trim()) {
    return `You are an elite resume editor. Rewrite each resume text block below to align with the target job description — use strong, precise, ATS-friendly wording and flawless grammar.\n\n${RULES}\n\nTARGET JOB DESCRIPTION:\n${jd}\n`;
  }
  return `You are an elite resume editor. Rewrite each resume text block below to fix grammar, tighten phrasing, and improve clarity and impact — keeping the same meaning.\n\n${RULES}\n`;
}

async function tailorWithGemini(blocks: TailorBlockInput[], jd: string, mode: "jd" | "grammar"): Promise<Record<string, string>> {
  const ai = new GoogleGenAI({ apiKey: geminiKey() });
  const instruction = buildInstruction(jd, mode);
  const payload = { instruction, blocks };
  const r = await ai.models.generateContent({
    model: process.env.SLAY_GEMINI_MODEL || "gemini-flash-latest",
    contents: JSON.stringify(payload),
    config: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.5, maxOutputTokens: 16000 },
  });
  const text = (r.text ?? "").trim();
  const json = JSON.parse(text) as { blocks: TailorBlockInput[] };
  const map: Record<string, string> = {};
  for (const b of json.blocks || []) if (b.id) map[b.id] = b.text;
  return map;
}

async function tailorWithClaude(blocks: TailorBlockInput[], jd: string, mode: "jd" | "grammar"): Promise<Record<string, string>> {
  const client = new Anthropic();
  const instruction = buildInstruction(jd, mode);
  const params = {
    model: process.env.SLAY_MODEL || "claude-opus-5",
    max_tokens: 8000,
    system: "You rewrite resume wording without altering facts or layout. Output strict JSON.",
    messages: [
      {
        role: "user",
        content: `${instruction}\n\nReturn ONLY JSON of the form {"blocks":[{"id":"...","text":"..."}]}.\n\nBLOCKS:\n${JSON.stringify(blocks)}`,
      },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client.messages.create(params);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = JSON.parse(text.slice(start, end + 1)) as { blocks: TailorBlockInput[] };
  const map: Record<string, string> = {};
  for (const b of json.blocks || []) if (b.id) map[b.id] = b.text;
  return map;
}

/** Light deterministic cleanup used when no AI key is configured. */
function grammarFallback(blocks: TailorBlockInput[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const b of blocks) {
    let t = b.text.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
    if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
    map[b.id] = t;
  }
  return map;
}

export interface TailorResult {
  rewrites: Record<string, string>;
  engine: "gemini" | "claude" | "none";
  warning: string | null;
}

/** Rewrite the given body blocks. Never throws — always returns a usable map
 * (falling back to the original/cleaned text) so the upload flow can't dead-end. */
export async function tailorUploadBlocks(
  blocks: TailorBlockInput[],
  jd: string,
  mode: "jd" | "grammar"
): Promise<TailorResult> {
  const original: Record<string, string> = {};
  for (const b of blocks) original[b.id] = b.text;
  if (blocks.length === 0) return { rewrites: {}, engine: "none", warning: null };

  if (geminiAvailable()) {
    try {
      const rewrites = await tailorWithGemini(blocks, jd, mode);
      return { rewrites: { ...original, ...rewrites }, engine: "gemini", warning: null };
    } catch (e) {
      console.error("[tailor-upload] Gemini failed:", e);
    }
  }
  if (claudeAvailable()) {
    try {
      const rewrites = await tailorWithClaude(blocks, jd, mode);
      return { rewrites: { ...original, ...rewrites }, engine: "claude", warning: null };
    } catch (e) {
      console.error("[tailor-upload] Claude failed:", e);
    }
  }

  if (mode === "grammar") {
    return {
      rewrites: grammarFallback(blocks),
      engine: "none",
      warning: "No AI key configured — applied basic grammar cleanup only. Add GEMINI_API_KEY for full rewrites.",
    };
  }
  return {
    rewrites: original,
    engine: "none",
    warning: "No AI key configured — the wording was left unchanged. Add GEMINI_API_KEY to tailor to a JD.",
  };
}
