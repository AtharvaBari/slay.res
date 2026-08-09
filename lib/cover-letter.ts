import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { geminiAvailable } from "./gemini";
import { claudeAvailable } from "./claude";

/* Cover-letter drafting from a JD + the candidate's real resume text. Grounded
 * in what the resume actually says — no invented employers or metrics. */

function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

function prompt(jd: string, name: string, baseText: string): string {
  return `Write a concise, compelling cover letter for the candidate below, targeting the job description.

Rules:
- 3-4 short paragraphs, professional and warm, ~250-320 words.
- Tone: Write in a grounded, authentic, and direct human voice. Avoid stiff, robotic formality (e.g., do not use cliché openings like "I am writing to express my enthusiastic interest..."). Start with a strong, confident hook.
- BANNED WORDS: Do not use "delve", "spearheaded", "orchestrated", "synergized", "transformative", "tapestry", "multifaceted", or "testament". Use plain, impactful English.
- Ground every claim in the candidate's real resume text — do NOT invent employers, metrics, or skills they don't have.
- Open with genuine interest in the role, connect their real experience to the JD's needs, and close with a confident call to action.
- Return ONLY the letter body text (no "Dear Hiring Manager" header block, no signature block beyond the closing line). Start directly with the greeting line.
${name ? `- Candidate name: ${name}` : ""}

CANDIDATE RESUME:
${baseText.slice(0, 3500)}

TARGET JOB DESCRIPTION:
${jd}`;
}

async function withGemini(jd: string, name: string, baseText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: geminiKey() });
  const r = await ai.models.generateContent({
    model: process.env.SLAY_GEMINI_MODEL || "gemini-flash-latest",
    contents: prompt(jd, name, baseText),
    config: { temperature: 0.7, maxOutputTokens: 4000 },
  });
  return (r.text ?? "").trim();
}

async function withClaude(jd: string, name: string, baseText: string): Promise<string> {
  const client = new Anthropic();
  const params = {
    model: process.env.SLAY_MODEL || "claude-opus-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt(jd, name, baseText) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client.messages.create(params);
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Generate a cover letter. Throws if no AI engine is available/succeeds. */
export async function generateCoverLetter(jd: string, name: string, baseText: string): Promise<string> {
  let lastError: any = null;
  if (geminiAvailable()) {
    try {
      const t = await withGemini(jd, name, baseText);
      if (t) return t;
    } catch (e) {
      console.error("[cover-letter] Gemini failed:", e);
      lastError = e;
    }
  }
  if (claudeAvailable()) {
    try {
      const t = await withClaude(jd, name, baseText);
      if (t) return t;
    } catch (e) {
      console.error("[cover-letter] Claude failed:", e);
      lastError = e;
    }
  }
  
  if (lastError) {
    throw new Error(`AI Engine Error: ${lastError instanceof Error ? lastError.message : "Unknown error"}. Check API key and server logs.`);
  }
  throw new Error("No AI engine is configured to write a cover letter. Add a GEMINI_API_KEY in .env");
}
