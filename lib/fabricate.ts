import { GoogleGenAI, Type } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { geminiAvailable } from "./gemini";
import { claudeAvailable } from "./claude";
import type { AlignmentResult, MasterProfile, Education } from "./schema";

/* ------------------------------------------------------------------ *
 *  "JD-matched draft" generation. Unlike the zero-hallucination engine,
 *  this INTENTIONALLY invents realistic experience/skills to fully match
 *  a job description — an opt-in drafting aid the user must review and
 *  replace with their real details. The real name/contact/education are
 *  kept; everything else is fabricated. Callers must surface a prominent
 *  "fabricated content" warning.
 * ------------------------------------------------------------------ */

export interface Identity {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  education: Education[];
}

interface DraftShape {
  summary: string;
  experiences: { company: string; role_title: string; date_range: string; bullets: string[] }[];
  projects: { name: string; role_title: string; date_range: string; bullets: string[] }[];
  skills: string[];
}

function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

const DRAFT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          role_title: { type: Type.STRING },
          date_range: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["company", "role_title", "date_range", "bullets"],
        propertyOrdering: ["company", "role_title", "date_range", "bullets"],
      },
    },
    projects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role_title: { type: Type.STRING },
          date_range: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "role_title", "date_range", "bullets"],
        propertyOrdering: ["name", "role_title", "date_range", "bullets"],
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary", "experiences", "projects", "skills"],
};

function instruction(jd: string, identity: Identity, baseText: string): string {
  return `Generate a resume that STRONGLY matches the target job description below. The goal is maximum alignment: cover the key required skills, tools, and responsibilities with concrete, realistic-sounding experience and metrics.

You MAY invent employers, roles, projects, skills, and quantified achievements as needed to match the JD — this is an explicitly-requested draft the user will review and replace with their real details.

Constraints:
- Keep the candidate's real identity: name "${identity.name || "the candidate"}" and their education (do not invent degrees).
- Produce 2-3 experiences and 1-2 projects with 3-4 strong, quantified bullets each.
- Framework: Strictly use the "Action + Context + Metric + Result" formula for every bullet point. Never write a vague responsibility; always show impact.
- Tone: Write like a highly competent, grounded human professional. Do not sound like a marketing brochure. Focus heavily on technical details, measurable impact, and concrete implementations.
- BANNED WORDS: Do not use "spearheaded", "orchestrated", "synergized", "elevated", "fostered", "tapestry", "seamlessly", or "pivotal". Use standard verbs (e.g., Built, Designed, Developed, Implemented, Led, Scaled, Managed).
- skills: 12-20 items drawn from the JD's required technologies and competencies.
- Keep everything realistic and professional; no placeholders like "Company X".

Existing resume text (for tone/level only — you may go beyond it):
${baseText.slice(0, 2500)}

TARGET JOB DESCRIPTION:
${jd}`;
}

async function draftWithGemini(jd: string, identity: Identity, baseText: string): Promise<DraftShape> {
  const ai = new GoogleGenAI({ apiKey: geminiKey() });
  const r = await ai.models.generateContent({
    model: process.env.SLAY_GEMINI_MODEL || "gemini-flash-latest",
    contents: instruction(jd, identity, baseText),
    config: { responseMimeType: "application/json", responseSchema: DRAFT_SCHEMA, temperature: 0.6, maxOutputTokens: 16000 },
  });
  return JSON.parse((r.text ?? "").trim()) as DraftShape;
}

async function draftWithClaude(jd: string, identity: Identity, baseText: string): Promise<DraftShape> {
  const client = new Anthropic();
  const params = {
    model: process.env.SLAY_MODEL || "claude-opus-5",
    max_tokens: 8000,
    system: "You draft a resume that matches a job description, inventing realistic experience as requested. Output strict JSON only.",
    messages: [
      {
        role: "user",
        content: `${instruction(jd, identity, baseText)}\n\nReturn ONLY JSON: {"summary":"...","experiences":[{"company","role_title","date_range","bullets":[]}],"projects":[{"name","role_title","date_range","bullets":[]}],"skills":[]}`,
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
  return JSON.parse(text.slice(start, end + 1)) as DraftShape;
}

/** Map the drafted shape + identity into a template result + profile. */
function assemble(draft: DraftShape, identity: Identity): { result: AlignmentResult; profile: MasterProfile } {
  let idc = 1;
  const nid = (p: string) => `${p}${idc++}`;

  const result: AlignmentResult = {
    tailored_summary: draft.summary || "",
    experiences: (draft.experiences || []).map((e) => ({
      source_experience_id: nid("exp"),
      company: e.company || "",
      role_title: e.role_title || "",
      date_range: e.date_range || "",
      bullet_points: (e.bullets || []).filter(Boolean).map((t) => ({ source_bullet_id: nid("b"), tailored_text: t, highlighted_keywords: [] })),
    })),
    projects: (draft.projects || []).map((p) => ({
      source_project_id: nid("proj"),
      name: p.name || "",
      role_title: p.role_title || "",
      date_range: p.date_range || "",
      bullet_points: (p.bullets || []).filter(Boolean).map((t) => ({ source_bullet_id: nid("b"), tailored_text: t, highlighted_keywords: [] })),
    })),
    custom_sections: [],
    verified_skills: [...new Set((draft.skills || []).filter(Boolean))],
    unmatched_requirements: [],
  };

  const section_order = ["summary", "experiences"];
  if (result.projects.length) section_order.push("projects");
  if (identity.education.length) section_order.push("education");
  section_order.push("skills");

  const profile: MasterProfile = {
    contact: {
      name: identity.name || "",
      email: identity.email || "",
      phone: identity.phone || "",
      location: identity.location || "",
      links: identity.links || [],
    },
    summary: draft.summary || "",
    experiences: result.experiences.map((e) => ({
      id: e.source_experience_id,
      company: e.company,
      role_title: e.role_title,
      date_range: e.date_range,
      bullets: e.bullet_points.map((b) => ({ id: b.source_bullet_id, text: b.tailored_text })),
    })),
    projects: result.projects.map((p) => ({
      id: p.source_project_id,
      name: p.name,
      role_title: p.role_title,
      date_range: p.date_range,
      bullets: p.bullet_points.map((b) => ({ id: b.source_bullet_id, text: b.tailored_text })),
    })),
    custom_sections: [],
    education: identity.education,
    skills: result.verified_skills,
    section_order,
  };

  return { result, profile };
}

export interface FabricateResult {
  result: AlignmentResult;
  profile: MasterProfile;
  engine: "gemini" | "claude";
}

/** Generate a JD-matched (fabricated) resume. Throws if no AI engine succeeds. */
export async function fabricateResume(jd: string, identity: Identity, baseText: string): Promise<FabricateResult> {
  if (geminiAvailable()) {
    try {
      const draft = await draftWithGemini(jd, identity, baseText);
      return { ...assemble(draft, identity), engine: "gemini" };
    } catch (e) {
      console.error("[fabricate] Gemini failed:", e);
    }
  }
  if (claudeAvailable()) {
    const draft = await draftWithClaude(jd, identity, baseText);
    return { ...assemble(draft, identity), engine: "claude" };
  }
  throw new Error("No AI engine is configured to generate a JD-matched draft.");
}
