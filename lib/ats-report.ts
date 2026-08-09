import { ACTION_VERBS } from "./keywords";
import type { AlignmentResult, MasterProfile } from "./schema";
import type { LayoutBlock } from "./pdf-layout";

/* Deterministic résumé quality / ATS report. Pure (client-safe). Complements
 * the JD keyword match with format & content checks that don't need a JD. */

export type CheckStatus = "pass" | "warn" | "fail";
export interface AtsCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
}
export interface AtsReport {
  score: number;
  checks: AtsCheck[];
}

interface AtsInput {
  hasEmail: boolean;
  hasPhone: boolean;
  summary?: string;
  bullets: string[];
  skills?: string[];
  hasEducation?: boolean;
  experienceDates?: boolean[];
}

const VERB_SET = new Set(ACTION_VERBS);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const startsWithVerb = (s: string) => VERB_SET.has(words(s)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "");
const hasNumber = (s: string) => /\d/.test(s);

const credit = (st: CheckStatus) => (st === "pass" ? 1 : st === "warn" ? 0.5 : 0);

export function computeAtsReport(input: AtsInput): AtsReport {
  const checks: AtsCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string, weight: number) =>
    checks.push({ id, label, status, detail, weight });

  // Contact
  const both = input.hasEmail && input.hasPhone;
  add(
    "contact",
    "Contact details",
    both ? "pass" : input.hasEmail || input.hasPhone ? "warn" : "fail",
    both ? "Email and phone present." : input.hasEmail ? "Add a phone number." : input.hasPhone ? "Add an email address." : "Add an email and phone number.",
    15
  );

  // Summary
  if (input.summary !== undefined) {
    const w = words(input.summary).length;
    add(
      "summary",
      "Professional summary",
      w >= 12 ? "pass" : w > 0 ? "warn" : "fail",
      w >= 12 ? "Clear summary present." : w > 0 ? "Summary is short — aim for 2-3 lines." : "Add a short professional summary.",
      10
    );
  }

  // Bullets present
  const n = input.bullets.length;
  add(
    "bullets",
    "Experience bullets",
    n >= 5 ? "pass" : n > 0 ? "warn" : "fail",
    n >= 5 ? `${n} bullet points.` : n > 0 ? `Only ${n} bullets — add more detail.` : "No bullet points found.",
    12
  );

  // Quantification
  if (n > 0) {
    const q = input.bullets.filter(hasNumber).length / n;
    add(
      "quantification",
      "Quantified impact",
      q >= 0.3 ? "pass" : q > 0 ? "warn" : "fail",
      `${Math.round(q * 100)}% of bullets include numbers. Aim for 30%+ with real metrics.`,
      15
    );

    // Action verbs
    const v = input.bullets.filter(startsWithVerb).length / n;
    add(
      "verbs",
      "Strong action verbs",
      v >= 0.6 ? "pass" : v >= 0.3 ? "warn" : "fail",
      `${Math.round(v * 100)}% of bullets start with a strong verb (e.g. Led, Built, Shipped).`,
      15
    );

    // Length
    const tooLong = input.bullets.filter((b) => words(b).length > 42).length;
    const tooShort = input.bullets.filter((b) => words(b).length < 4).length;
    add(
      "length",
      "Bullet length",
      tooLong + tooShort === 0 ? "pass" : "warn",
      tooLong + tooShort === 0 ? "Bullets are well-sized." : `${tooLong} too long, ${tooShort} too short — keep bullets 1-2 lines.`,
      8
    );
  }

  // Skills
  if (input.skills !== undefined) {
    const s = input.skills.length;
    add("skills", "Skills listed", s >= 6 ? "pass" : s > 0 ? "warn" : "fail", s >= 6 ? `${s} skills.` : s > 0 ? `Only ${s} skills — list more.` : "Add a skills section.", 12);
  }

  // Education
  if (input.hasEducation !== undefined) {
    add("education", "Education", input.hasEducation ? "pass" : "warn", input.hasEducation ? "Education present." : "Add your education.", 8);
  }

  // Dates
  if (input.experienceDates && input.experienceDates.length) {
    const withDates = input.experienceDates.filter(Boolean).length;
    const all = withDates === input.experienceDates.length;
    add("dates", "Experience dates", all ? "pass" : "warn", all ? "All roles have dates." : "Some roles are missing dates.", 5);
  }

  const totalW = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round((checks.reduce((s, c) => s + c.weight * credit(c.status), 0) / totalW) * 100);
  return { score, checks };
}

export function atsFromTemplate(profile: MasterProfile, result: AlignmentResult): AtsReport {
  const bullets = [
    ...result.experiences.flatMap((e) => e.bullet_points.map((b) => b.tailored_text)),
    ...result.projects.flatMap((p) => p.bullet_points.map((b) => b.tailored_text)),
    ...result.custom_sections.flatMap((s) => s.items.flatMap((i) => i.bullet_points.map((b) => b.tailored_text))),
  ].filter((t) => t.trim());
  return computeAtsReport({
    hasEmail: !!profile.contact.email.trim(),
    hasPhone: !!profile.contact.phone.trim(),
    summary: (result.tailored_summary || profile.summary || "").trim(),
    bullets,
    skills: result.verified_skills.length ? result.verified_skills : profile.skills,
    hasEducation: profile.education.length > 0,
    experienceDates: result.experiences.map((e) => !!e.date_range.trim()),
  });
}

export function atsFromUpload(blocks: LayoutBlock[]): AtsReport {
  const contact = blocks.filter((b) => b.kind === "contact").map((b) => b.text).join(" ");
  const bodyBullets = blocks
    .filter((b) => b.kind === "body" && (b.bullet || (words(b.text).length >= 4 && words(b.text).length <= 60)))
    .map((b) => b.text);
  return computeAtsReport({
    hasEmail: /\S+@\S+\.\S+/.test(contact),
    hasPhone: /\+?\d[\d ()\-]{7,}\d/.test(contact),
    bullets: bodyBullets,
    // summary / skills / education / dates aren't reliably identifiable from an
    // arbitrary PDF, so they're skipped rather than scored unfairly.
  });
}
