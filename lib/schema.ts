import { z } from "zod";

/* ------------------------------------------------------------------ *
 *  Master Profile — the parsed, structured representation of the
 *  candidate's real resume. Every bullet carries a stable unique id so
 *  downstream tailoring can be traced back to a true source fact.
 * ------------------------------------------------------------------ */

export const BulletSchema = z.object({
  id: z.string(),
  text: z.string(),
});
export type Bullet = z.infer<typeof BulletSchema>;

export const ExperienceSchema = z.object({
  id: z.string(),
  company: z.string(),
  role_title: z.string(),
  date_range: z.string().default(""),
  bullets: z.array(BulletSchema).default([]),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string().default(""),
  date_range: z.string().default(""),
});
export type Education = z.infer<typeof EducationSchema>;

export const ContactSchema = z.object({
  name: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  links: z.array(z.string()).default([]),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role_title: z.string().default(""),
  date_range: z.string().default(""),
  bullets: z.array(BulletSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CustomItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  role_title: z.string().default(""),
  date_range: z.string().default(""),
  bullets: z.array(BulletSchema).default([]),
});
export type CustomItem = z.infer<typeof CustomItemSchema>;

export const CustomSectionSchema = z.object({
  id: z.string(),
  section_title: z.string(),
  items: z.array(CustomItemSchema).default([]),
});
export type CustomSection = z.infer<typeof CustomSectionSchema>;

export const TemplateConfigSchema = z.object({
  fontPairing: z.enum(["modern", "classic", "minimalist"]).default("modern"),
  primaryColor: z.string().default("#000000"), // Hex code
  lineSpacing: z.enum(["compact", "normal", "relaxed"]).default("normal"),
});
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

export const MasterProfileSchema = z.object({
  contact: ContactSchema,
  summary: z.string().default(""),
  experiences: z.array(ExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  custom_sections: z.array(CustomSectionSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(z.string()).default([]),
  section_order: z.array(z.string()).default(["summary", "experiences", "projects", "education", "skills"]),
  template_config: TemplateConfigSchema.optional(),
});
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

/* ------------------------------------------------------------------ *
 *  Tailored output — the JD-aligned resume. This is the strict schema
 *  the API route enforces (JSON-schema structured output when Claude is
 *  used; the same shape when the deterministic engine is used).
 * ------------------------------------------------------------------ */

export const TailoredBulletSchema = z.object({
  source_bullet_id: z.string(),
  tailored_text: z.string(),
  highlighted_keywords: z.array(z.string()).default([]),
  semantic_score: z.number().optional(),
});
export type TailoredBullet = z.infer<typeof TailoredBulletSchema>;

export const TailoredExperienceSchema = z.object({
  source_experience_id: z.string(),
  company: z.string(),
  role_title: z.string(),
  date_range: z.string().default(""),
  bullet_points: z.array(TailoredBulletSchema).default([]),
});
export type TailoredExperience = z.infer<typeof TailoredExperienceSchema>;

export const TailoredProjectSchema = z.object({
  source_project_id: z.string(),
  name: z.string(),
  role_title: z.string().default(""),
  date_range: z.string().default(""),
  bullet_points: z.array(TailoredBulletSchema).default([]),
});
export type TailoredProject = z.infer<typeof TailoredProjectSchema>;

export const TailoredCustomItemSchema = z.object({
  source_item_id: z.string(),
  name: z.string(),
  role_title: z.string().default(""),
  date_range: z.string().default(""),
  bullet_points: z.array(TailoredBulletSchema).default([]),
});
export type TailoredCustomItem = z.infer<typeof TailoredCustomItemSchema>;

export const TailoredCustomSectionSchema = z.object({
  source_section_id: z.string(),
  section_title: z.string(),
  items: z.array(TailoredCustomItemSchema).default([]),
});
export type TailoredCustomSection = z.infer<typeof TailoredCustomSectionSchema>;

export const UnmatchedRequirementSchema = z.object({
  skill_or_requirement: z.string(),
  recommendation: z.string(),
});
export type UnmatchedRequirement = z.infer<typeof UnmatchedRequirementSchema>;

export const AlignmentResultSchema = z.object({
  tailored_summary: z.string(),
  experiences: z.array(TailoredExperienceSchema),
  projects: z.array(TailoredProjectSchema).default([]),
  custom_sections: z.array(TailoredCustomSectionSchema).default([]),
  verified_skills: z.array(z.string()),
  unmatched_requirements: z.array(UnmatchedRequirementSchema),
});
export type AlignmentResult = z.infer<typeof AlignmentResultSchema>;

/* ------------------------------------------------------------------ *
 *  Proof-of-Truth metadata — the "Zero Hallucination" verification the
 *  UI renders as a badge. Computed after alignment by cross-checking
 *  every tailored bullet id against the master profile.
 * ------------------------------------------------------------------ */

export const ProofOfTruthSchema = z.object({
  total_bullets: z.number(),
  traced_bullets: z.number(),
  orphan_bullets: z.array(z.string()),
  fully_traced: z.boolean(),
  engine: z.enum(["gemini", "claude", "deterministic"]),
});
export type ProofOfTruth = z.infer<typeof ProofOfTruthSchema>;

export interface AnalyzeResponse {
  result: AlignmentResult;
  proof: ProofOfTruth;
  matched_keywords: string[];
  /** Present when the AI path failed / isn't configured and output is the basic reorder. */
  warning?: string | null;
}

/* JSON Schema handed to Claude's structured-output enforcement. Mirrors
 * AlignmentResultSchema. additionalProperties:false is required. */
export const ALIGNMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tailored_summary: { type: "string" },
    experiences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_experience_id: { type: "string" },
          company: { type: "string" },
          role_title: { type: "string" },
          date_range: { type: "string" },
          bullet_points: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                source_bullet_id: { type: "string" },
                tailored_text: { type: "string" },
                highlighted_keywords: { type: "array", items: { type: "string" } },
              },
              required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
            },
          },
        },
        required: ["source_experience_id", "company", "role_title", "date_range", "bullet_points"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_project_id: { type: "string" },
          name: { type: "string" },
          role_title: { type: "string" },
          date_range: { type: "string" },
          bullet_points: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                source_bullet_id: { type: "string" },
                tailored_text: { type: "string" },
                highlighted_keywords: { type: "array", items: { type: "string" } },
              },
              required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
            },
          },
        },
        required: ["source_project_id", "name", "role_title", "date_range", "bullet_points"],
      },
    },
    custom_sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_section_id: { type: "string" },
          section_title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                source_item_id: { type: "string" },
                name: { type: "string" },
                role_title: { type: "string" },
                date_range: { type: "string" },
                bullet_points: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      source_bullet_id: { type: "string" },
                      tailored_text: { type: "string" },
                      highlighted_keywords: { type: "array", items: { type: "string" } },
                    },
                    required: ["source_bullet_id", "tailored_text", "highlighted_keywords"],
                  },
                },
              },
              required: ["source_item_id", "name", "role_title", "date_range", "bullet_points"],
            },
          },
        },
        required: ["source_section_id", "section_title", "items"],
      },
    },
    verified_skills: { type: "array", items: { type: "string" } },
    unmatched_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          skill_or_requirement: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["skill_or_requirement", "recommendation"],
      },
    },
  },
  required: ["tailored_summary", "experiences", "projects", "verified_skills", "unmatched_requirements"],
} as const;

export const SLAY_SYSTEM_PROMPT =
  "You are Slay.res, an elite resume optimizer and expert career coach. Your job is to rewrite and dramatically enhance the candidate's existing bullets. You must use strong action verbs, concise wording, and compelling narratives to maximize professional impact and ATS readability based on the target JD. However, you MUST strictly adhere to the Zero Hallucination constraint: NEVER invent facts, metrics, percentages, companies, titles, or tools not present in the input. Every generated bullet MUST reference an existing source_bullet_id, and every experience/project MUST reference its exact source id. If a JD skill is missing, DO NOT invent it—add it to unmatched_requirements. Rewrite to make it sound incredibly impressive while staying 100% truthful.";
