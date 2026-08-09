import { GoogleGenAI, Type } from "@google/genai";
import {
  MasterProfile,
  MasterProfileSchema,
  AlignmentResult,
  AlignmentResultSchema,
  SLAY_SYSTEM_PROMPT,
} from "./schema";

// Evergreen alias — resolves to Google's current stable Flash model, so it
// won't 404 when a specific version (e.g. gemini-2.5-flash) is deprecated.
const MODEL = process.env.SLAY_GEMINI_MODEL || "gemini-flash-latest";

// Try the configured model first, then known-good alternates. This survives a
// deprecated model (404) or a transient model error without failing the whole
// request. Key/quota errors are NOT retried across models (switching won't fix
// them). Order kept unique.
const MODEL_CHAIN = [...new Set([MODEL, "gemini-flash-latest", "gemini-3.5-flash"])];

/** Trim surrounding whitespace/quotes that commonly sneak in from .env files. */
function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

export function geminiAvailable(): boolean {
  return geminiKey().length > 0;
}

/** Run generateContent across the model chain; return the first non-empty text.
 * Aborts early on key/quota errors (retrying other models can't fix those). */
async function generateText(
  ai: GoogleGenAI,
  config: Record<string, unknown>,
  contents: string
): Promise<string> {
  let lastErr: unknown = new Error("No models attempted.");
  for (const model of MODEL_CHAIN) {
    try {
      const r = await ai.models.generateContent({ model, contents, config });
      const text = (r.text ?? "").trim();
      if (text) return text;
      lastErr = new Error("Empty Gemini response (possibly truncated or blocked).");
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      // These won't be fixed by switching models — fail fast.
      if (/API key not valid|API_KEY_INVALID|invalid.?api.?key|quota|RESOURCE_EXHAUSTED|rate.?limit|429/i.test(msg)) {
        throw e;
      }
    }
  }
  throw lastErr;
}

/* Gemini's responseSchema uses the OpenAPI-subset Type enum and does NOT accept
 * `additionalProperties`, so this mirrors AlignmentResultSchema in the shape
 * Gemini expects (distinct from the Anthropic JSON schema in schema.ts). */
const GEMINI_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tailored_summary: { type: Type.STRING },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_experience_id: { type: Type.STRING },
          company: { type: Type.STRING },
          role_title: { type: Type.STRING },
          date_range: { type: Type.STRING },
          bullet_points: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source_bullet_id: { type: Type.STRING },
                tailored_text: { type: Type.STRING },
                highlighted_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
              propertyOrdering: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
            },
          },
        },
        required: ["source_experience_id", "company", "role_title", "date_range", "bullet_points"],
        propertyOrdering: ["source_experience_id", "company", "role_title", "date_range", "bullet_points"],
      },
    },
    projects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_project_id: { type: Type.STRING },
          name: { type: Type.STRING },
          role_title: { type: Type.STRING },
          date_range: { type: Type.STRING },
          bullet_points: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source_bullet_id: { type: Type.STRING },
                tailored_text: { type: Type.STRING },
                highlighted_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
              propertyOrdering: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
            },
          },
        },
        required: ["source_project_id", "name", "role_title", "date_range", "bullet_points"],
        propertyOrdering: ["source_project_id", "name", "role_title", "date_range", "bullet_points"],
      },
    },
    custom_sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_section_id: { type: Type.STRING },
          section_title: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source_item_id: { type: Type.STRING },
                name: { type: Type.STRING },
                role_title: { type: Type.STRING },
                date_range: { type: Type.STRING },
                bullet_points: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      source_bullet_id: { type: Type.STRING },
                      tailored_text: { type: Type.STRING },
                      highlighted_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
                    propertyOrdering: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
                  },
                },
              },
              required: ["source_item_id", "name", "role_title", "date_range", "bullet_points"],
              propertyOrdering: ["source_item_id", "name", "role_title", "date_range", "bullet_points"],
            },
          },
        },
        required: ["source_section_id", "section_title", "items"],
        propertyOrdering: ["source_section_id", "section_title", "items"],
      },
    },
    verified_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    unmatched_requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill_or_requirement: { type: Type.STRING },
          recommendation: { type: Type.STRING },
        },
        required: ["skill_or_requirement", "recommendation"],
        propertyOrdering: ["skill_or_requirement", "recommendation"],
      },
    },
  },
  required: ["tailored_summary", "experiences", "projects", "verified_skills", "unmatched_requirements"],
  propertyOrdering: ["tailored_summary", "experiences", "projects", "custom_sections", "verified_skills", "unmatched_requirements"],
};

/**
 * Semantic alignment via Gemini with JSON-schema structured output. Sends only
 * the real profile + JD; the strict system prompt + schema forbid fabrication,
 * and the caller still runs verifyTraceability() on the result so any drift is
 * caught and reverted. Throws on any failure so the route can fall back to the
 * deterministic engine.
 */
export async function alignWithGemini(
  profile: MasterProfile,
  jd: string
): Promise<AlignmentResult> {
  const ai = new GoogleGenAI({ apiKey: geminiKey() });

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

You must adhere to the following ZERO-HALLUCINATION rules:
1. Do NOT invent new experiences, projects, custom sections, or bullets.
2. Every tailored experience must include a "source_experience_id" matching the input.
3. Every tailored project must include a "source_project_id" matching the input.
4. Every tailored custom section must include a "source_section_id", and its items must include "source_item_id", matching the input.
5. Every bullet point you return MUST include a "source_bullet_id" from the input.
6. Do NOT fabricate facts, numbers, metrics, or technologies that are not explicitly present in the source text. You MUST rewrite and heavily enhance the grammar and phrasing, but the core fact must remain identically true.`
      : `You are an elite career coach. Dramatically rewrite and enhance the grammar, clarity, and impact of the candidate's REAL summary, experience, and projects to make it highly professional and ATS-friendly. Use powerful action verbs and compelling narratives.

You must output:
      - tailored_summary: a powerful, concise professional summary. Do not just copy the input.
      - experiences: an array of user experiences
      - projects: an array of user projects
      - custom_sections: an array of arbitrary sections
      - verified_skills: curate, order, and perfectly capitalize the candidate's skills for maximum ATS impact. Do not just copy the input verbatim; select and format the best ones.
      - unmatched_requirements: leave empty since there is no target JD

You must adhere to the following ZERO-HALLUCINATION rules:
1. Do NOT invent new experiences, projects, custom sections, or bullets.
2. Every tailored experience must include a "source_experience_id" matching the input.
3. Every tailored project must include a "source_project_id" matching the input.
4. Every tailored custom section must include a "source_section_id", and its items must include "source_item_id", matching the input.
5. Every bullet point you return MUST include a "source_bullet_id" from the input.
6. Do NOT fabricate facts, numbers, metrics, or technologies that are not explicitly present in the source text. You MUST rewrite and heavily enhance the grammar and phrasing, but the core fact must remain identically true.`,
    candidate_master_profile: profile,
  };
  if (jd) {
    userPayload.target_job_description = jd;
  }

  const text = await generateText(
    ai,
    {
      systemInstruction: SLAY_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.55,
      maxOutputTokens: 16000,
    },
    JSON.stringify(userPayload)
  );
  const json = JSON.parse(text);
  return AlignmentResultSchema.parse(json);
}

/* ------------------------------------------------------------------ *
 *  AI resume parsing — extracts raw resume text into a complete,
 *  correctly-structured MasterProfile. Far more robust than the regex
 *  parser for real-world formats (projects as "Name: paragraph",
 *  "Cert | Issuer" lines, comma-separated competencies, etc.).
 * ------------------------------------------------------------------ */

const entryItem = (nameField: "company" | "name") => ({
  type: Type.OBJECT,
  properties: {
    [nameField]: { type: Type.STRING },
    role_title: { type: Type.STRING },
    date_range: { type: Type.STRING },
    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [nameField, "role_title", "date_range", "bullets"],
  propertyOrdering: [nameField, "role_title", "date_range", "bullets"],
});

const PARSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contact: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
        links: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["name", "email", "phone", "location", "links"],
    },
    summary: { type: Type.STRING },
    experiences: { type: Type.ARRAY, items: entryItem("company") },
    projects: { type: Type.ARRAY, items: entryItem("name") },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          institution: { type: Type.STRING },
          degree: { type: Type.STRING },
          date_range: { type: Type.STRING },
        },
        required: ["institution", "degree", "date_range"],
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    custom_sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section_title: { type: Type.STRING },
          items: { type: Type.ARRAY, items: entryItem("name") },
        },
        required: ["section_title", "items"],
      },
    },
  },
  required: ["contact", "summary", "experiences", "projects", "education", "skills", "custom_sections"],
};

const PARSE_INSTRUCTION = `You are an expert ATS resume parser. Extract the resume text below into structured JSON, faithfully and COMPLETELY. Do NOT invent, summarize, rewrite, or drop any content — preserve the original wording.

Rules:
- contact.name = the person's full name, exactly once. NEVER repeat the name, phone, or email into any other field or section.
- summary = the professional summary / objective / profile paragraph.
- experiences = paid work / internship roles ONLY (company, role_title, date_range, and each responsibility or achievement as a separate bullet).
- projects = personal, academic, or technical projects. For a line like "Project Name: description...", set name = "Project Name" and put the description sentence(s) as bullets. Include EVERY project as its own entry.
- education = each degree / school (institution, degree, date_range).
- skills = a FLAT list of individual skills. If skills are grouped like "Backend & Databases: Python, C++, SQL", output each skill separately (Python, C++, SQL) and DROP the category label.
- custom_sections = any section that is NOT one of the above (Certifications, Awards, Achievements, Publications, Volunteering, Languages, Interests, Core Competencies, etc.). Use the section's exact title as section_title.
  * For entries like "Item | Issuer" or "Item — Issuer" (e.g. certifications), set name = "Item" and put the issuer/detail as a single bullet.
  * For a comma- or line-separated list of terms (e.g. Core Competencies, Interests), output exactly ONE item with name = "" and each term as a separate bullet.
- Leave any unknown field as an empty string; leave any absent section as an empty array. Every entry MUST include role_title, date_range, and bullets keys (use "" or [] when absent).

Resume text:
`;

export async function parseResumeWithGemini(rawText: string): Promise<MasterProfile> {
  const ai = new GoogleGenAI({ apiKey: geminiKey() });

  const text = await generateText(
    ai,
    {
      responseMimeType: "application/json",
      responseSchema: PARSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 16000,
    },
    PARSE_INSTRUCTION + rawText
  );
  const raw = JSON.parse(text) as any;

  // Assign stable ids and build a clean section order.
  let idc = 1;
  const nid = (p: string) => `${p}${idc++}`;
  const toBullets = (arr?: string[]) =>
    (arr ?? []).filter((t) => typeof t === "string" && t.trim()).map((t) => ({ id: nid("b"), text: t.trim() }));

  const experiences = (raw.experiences ?? []).map((e: any) => ({
    id: nid("exp"),
    company: e.company ?? "",
    role_title: e.role_title ?? "",
    date_range: e.date_range ?? "",
    bullets: toBullets(e.bullets),
  }));
  const projects = (raw.projects ?? []).map((p: any) => ({
    id: nid("proj"),
    name: p.name ?? "",
    role_title: p.role_title ?? "",
    date_range: p.date_range ?? "",
    bullets: toBullets(p.bullets),
  }));
  const custom_sections = (raw.custom_sections ?? [])
    .filter((s: any) => (s.section_title ?? "").trim() && (s.items ?? []).length)
    .map((s: any) => ({
      id: nid("csec"),
      section_title: (s.section_title ?? "Section").trim(),
      items: (s.items ?? []).map((it: any) => ({
        id: nid("citem"),
        name: it.name ?? "",
        role_title: it.role_title ?? "",
        date_range: it.date_range ?? "",
        bullets: toBullets(it.bullets),
      })),
    }));
  const education = (raw.education ?? []).map((ed: any) => ({
    id: nid("edu"),
    institution: ed.institution ?? "",
    degree: ed.degree ?? "",
    date_range: ed.date_range ?? "",
  }));
  const skills = [...new Set((raw.skills ?? []).filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim()))] as string[];
  const summary = (raw.summary ?? "").trim();
  const contact = {
    name: raw.contact?.name ?? "",
    email: raw.contact?.email ?? "",
    phone: raw.contact?.phone ?? "",
    location: raw.contact?.location ?? "",
    links: (raw.contact?.links ?? []).filter((l: any) => typeof l === "string" && l.trim()),
  };

  const order: string[] = [];
  if (summary) order.push("summary");
  if (experiences.length) order.push("experiences");
  if (projects.length) order.push("projects");
  if (education.length) order.push("education");
  if (skills.length) order.push("skills");
  for (const s of custom_sections) order.push(`custom:${s.section_title}`);

  return MasterProfileSchema.parse({
    contact,
    summary,
    experiences,
    projects,
    custom_sections,
    education,
    skills,
    section_order: order,
  });
}
