import crypto from "crypto";
import {
  MasterProfile,
  Experience,
  Project,
  Education,
  Contact,
  CustomSection,
  CustomItem,
} from "./schema";
import { extractKeywords, SKILL_LEXICON, prettySkill, textHasKeyword } from "./keywords";

/* Deterministic resume-text -> MasterProfile parser. Heuristic but stable:
 * the same input always yields the same structured profile, and it never
 * invents facts — it only segments and labels what is present. */

const SECTION_HEADS: Record<string, keyof typeof SECTION_ALIASES | string> = {};
const SECTION_ALIASES = {
  experience: ["experience", "work experience", "employment", "professional experience", "work history"],
  education: ["education", "academic background"],
  skills: ["skills", "technical skills", "core competencies", "technologies", "tech stack"],
  summary: ["summary", "professional summary", "profile", "objective", "about"],
  projects: ["projects", "personal projects", "selected projects", "academic projects", "open source", "software projects", "side projects"],
};

type Section = "experience" | "education" | "skills" | "summary" | "projects" | null;

const BULLET_PREFIX = /^\s*([-•*▪·‣◦]|\d+\.)\s+/;
const DATE_RANGE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)[a-z]*\.?\s*\d{4}|\d{4}|present|current)\s*(?:[-–—to]+)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)[a-z]*\.?\s*\d{4}|\d{4}|present|current)/i;

function classifyHeading(line: string): Section {
  const l = line.toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (!l || l.length > 32) return null;
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((a) => l === a || l === a + "s")) return key as Section;
  }
  return null;
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  // ALL CAPS short line, or a known section alias.
  const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t) && !BULLET_PREFIX.test(t);
  return isAllCaps || classifyHeading(t) !== null;
}

export function parseResumeText(raw: string): MasterProfile {
  const text = raw.replace(/\r/g, "");
  const rawLines = text.split("\n");
  const lines = rawLines.map((l) => l.replace(/\t/g, " ").trimEnd());

  const contact = extractContact(lines);

  // Walk the document assigning each line to a section.
  let current: string | null = null;
  const buckets: Record<string, string[]> = { experience: [], education: [], skills: [], summary: [], projects: [] };
  const customBuckets: Record<string, string[]> = {};
  const preamble: string[] = [];

  const sectionOrder: string[] = [];
  const addedToOrder = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        if (buckets[current]) buckets[current].push("");
        else if (customBuckets[current]) customBuckets[current].push("");
      }
      continue;
    }
    const heading = classifyHeading(trimmed);
    if (heading) {
      current = heading;
      const orderKey = heading === "experience" ? "experiences" : heading;
      if (!addedToOrder.has(orderKey)) {
        sectionOrder.push(orderKey);
        addedToOrder.add(orderKey);
      }
      continue;
    }
    // A bare ALL-CAPS heading we don't recognize resets section context to a dynamic bucket.
    if (looksLikeHeading(trimmed) && classifyHeading(trimmed) === null && trimmed.length < 30) {
      current = trimmed;
      if (!customBuckets[current]) customBuckets[current] = [];
      
      // Convert "CERTIFICATIONS" -> "Certifications" for display
      const displayTitle = trimmed.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      const orderKey = `custom:${displayTitle}`;
      if (!addedToOrder.has(orderKey)) {
        sectionOrder.push(orderKey);
        addedToOrder.add(orderKey);
      }
      continue;
    }
    if (current) {
      if (buckets[current]) buckets[current].push(line);
      else if (customBuckets[current]) customBuckets[current].push(line);
    } else {
      preamble.push(line);
    }
  }

  const summary = cleanBlock(buckets.summary).join(" ").trim();
  const skills = parseSkills(buckets.skills, text);
  const experiences = parseExperiences(buckets.experience);
  const projects = parseProjects(buckets.projects);
  const education = parseEducation(buckets.education);

  const custom_sections: CustomSection[] = [];
  let customId = 1;
  for (const [rawTitle, sectionLines] of Object.entries(customBuckets)) {
    const items = parseCustomSection(sectionLines);
    if (items.length > 0) {
      const displayTitle = rawTitle.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      custom_sections.push({
        id: crypto.randomUUID(),
        section_title: displayTitle,
        items,
      });
    }
  }

  // Ensure standard sections are present in order if they have content but weren't captured via explicit headers.
  if (summary && !addedToOrder.has("summary")) sectionOrder.unshift("summary");
  if (experiences.length > 0 && !addedToOrder.has("experiences")) sectionOrder.push("experiences");
  if (projects.length > 0 && !addedToOrder.has("projects")) sectionOrder.push("projects");
  if (education.length > 0 && !addedToOrder.has("education")) sectionOrder.push("education");
  if (skills.length > 0 && !addedToOrder.has("skills")) sectionOrder.push("skills");

  return {
    contact,
    summary,
    experiences,
    projects,
    custom_sections,
    education,
    skills,
    section_order: sectionOrder,
  };
}

function cleanBlock(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

function extractContact(lines: string[]): Contact {
  const joined = lines.join("\n");
  const email = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ?? "";
  const phone =
    joined.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? "";
  const links = [...joined.matchAll(/((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|[a-z0-9-]+\.[a-z]{2,})\/[^\s|,]+)/gi)]
    .map((m) => m[1])
    .filter((u) => !u.includes("@"))
    .slice(0, 4);

  // Name: first non-empty line that isn't contact metadata.
  let name = "";
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (t.includes("@") || /\d{3}/.test(t) || /https?:|linkedin|github/i.test(t)) continue;
    if (t.length > 40) continue;
    name = t;
    break;
  }

  // Location: a line like "City, ST" or "City, Country".
  const location =
    joined.match(/\b([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*,\s*[A-Z]{2}(?:\s\d{5})?)\b/)?.[1] ?? "";

  return { name, email, phone, location, links: [...new Set(links)] };
}

function parseSkills(sectionLines: string[], fullText: string): string[] {
  const set = new Set<string>();
  const joined = sectionLines.join("\n");
  if (joined.trim()) {
    // Split on common delimiters.
    for (const raw of joined.split(/[,•|/·;\n]/)) {
      const s = raw.replace(BULLET_PREFIX, "").replace(/^[^a-zA-Z0-9+.#]+/, "").trim();
      if (s && s.length <= 30 && /[a-zA-Z]/.test(s)) set.add(prettySkill(s));
    }
  }
  // Augment with lexicon skills detected anywhere in the resume so a Skills
  // section isn't strictly required.
  for (const skill of SKILL_LEXICON) {
    if (textHasKeyword(fullText, skill)) set.add(prettySkill(skill));
  }
  return [...set].slice(0, 60);
}

function parseExperiences(sectionLines: string[]): Experience[] {
  const experiences: Experience[] = [];
  let expIndex = 0;
  let curr: Experience | null = null;
  let sawBulletForCurr = false;

  const pushCurr = () => {
    if (curr && (curr.bullets.length || curr.company || curr.role_title)) {
      experiences.push(curr);
    }
  };

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBullet = BULLET_PREFIX.test(line);

    if (isBullet && curr) {
      const text = trimmed.replace(BULLET_PREFIX, "").trim();
      if (text) {
        curr.bullets.push({ id: crypto.randomUUID(), text });
        sawBulletForCurr = true;
      }
      continue;
    }

    // Non-bullet line. Treat as a new experience header if it looks like one:
    // has a date range, a company/role separator, or we just closed bullets.
    const hasDate = DATE_RANGE.test(trimmed);
    const hasSep = /\s(?:at|@|[|–—-])\s/i.test(trimmed);
    const startNew = !curr || sawBulletForCurr || (hasDate && !!curr.date_range);

    if (startNew) {
      pushCurr();
      curr = {
        id: crypto.randomUUID(),
        company: "",
        role_title: "",
        date_range: "",
        bullets: [],
      };
      sawBulletForCurr = false;
    }

    if (!curr) continue;
    if (!curr.date_range) {
      const dateMatch = trimmed.match(DATE_RANGE);
      if (dateMatch) curr.date_range = dateMatch[0].trim();
    }

    const withoutDate = curr.date_range && trimmed.includes(curr.date_range) ? trimmed.replace(curr.date_range, "").trim() : trimmed;
    const cleaned = withoutDate.replace(/[|–—-]\s*$/, "").trim();

    if (cleaned) {
      if (!curr.role_title && !curr.company) {
        const parts = cleaned.split(/\s(?:at|@)\s|\s[|–—]\s|\s-\s/i).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          curr.role_title = parts[0];
          curr.company = parts[1];
        } else {
          curr.role_title = cleaned;
        }
      } else if (!curr.company && cleaned !== curr.role_title) {
        curr.company = cleaned;
      }
    }
  }
  pushCurr();

  // Fallback: if segmentation produced a single blob, keep it — still traceable.
  return experiences;
}

function parseProjects(sectionLines: string[]): Project[] {
  const projects: Project[] = [];
  let projIndex = 0;
  let curr: Project | null = null;
  let sawBulletForCurr = false;

  const pushCurr = () => {
    if (curr && (curr.bullets.length || curr.name || curr.role_title)) {
      projects.push(curr);
    }
  };

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBullet = BULLET_PREFIX.test(line);

    if (isBullet && curr) {
      const text = trimmed.replace(BULLET_PREFIX, "").trim();
      if (text) {
        curr.bullets.push({ id: crypto.randomUUID(), text });
        sawBulletForCurr = true;
      }
      continue;
    }

    const hasDate = DATE_RANGE.test(trimmed);
    const hasSep = /\s(?:at|@|[|–—-])\s/i.test(trimmed);
    const startNew = !curr || sawBulletForCurr || (hasDate && !!curr.date_range);

    if (startNew) {
      pushCurr();
      curr = {
        id: crypto.randomUUID(),
        name: "",
        role_title: "",
        date_range: "",
        bullets: [],
      };
      sawBulletForCurr = false;
    }

    if (!curr) continue;
    if (!curr.date_range) {
      const dateMatch = trimmed.match(DATE_RANGE);
      if (dateMatch) curr.date_range = dateMatch[0].trim();
    }

    const withoutDate = curr.date_range && trimmed.includes(curr.date_range) ? trimmed.replace(curr.date_range, "").trim() : trimmed;
    const cleaned = withoutDate.replace(/[|–—-]\s*$/, "").trim();

    if (cleaned) {
      if (!curr.role_title && !curr.name) {
        const parts = cleaned.split(/\s(?:at|@)\s|\s[|–—]\s|\s-\s/i).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          curr.role_title = parts[0];
          curr.name = parts[1];
        } else {
          curr.name = cleaned;
        }
      } else if (!curr.role_title && cleaned !== curr.name) {
        curr.role_title = cleaned;
      }
    }
  }
  pushCurr();

  return projects;
}

function parseEducation(sectionLines: string[]): Education[] {
  const entries: Education[] = [];
  const clean = cleanBlock(sectionLines);
  let idx = 0;
  for (let i = 0; i < clean.length; i++) {
    const line = clean[i].replace(BULLET_PREFIX, "").trim();
    if (!line) continue;
    idx += 1;
    const dateMatch = line.match(DATE_RANGE) || clean[i + 1]?.match(DATE_RANGE);
    const date_range = dateMatch ? dateMatch[0].trim() : "";
    const withoutDate = line.replace(DATE_RANGE, "").trim();
    const parts = withoutDate.split(/\s[|–—-]\s|,\s/).map((p) => p.trim()).filter(Boolean);
    entries.push({
      id: crypto.randomUUID(),
      institution: parts[0] ?? withoutDate,
      degree: parts.slice(1).join(", "),
      date_range,
    });
  }
  return entries.slice(0, 6);
}

function parseCustomSection(sectionLines: string[]): CustomItem[] {
  const items: CustomItem[] = [];
  let itemIndex = 0;
  let curr: CustomItem | null = null;
  let sawBulletForCurr = false;

  const pushCurr = () => {
    if (curr && (curr.bullets.length || curr.name || curr.role_title)) {
      items.push(curr);
    }
  };

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBullet = BULLET_PREFIX.test(line);

    if (isBullet && curr) {
      const text = trimmed.replace(BULLET_PREFIX, "").trim();
      if (text) {
        curr.bullets.push({ id: crypto.randomUUID(), text });
        sawBulletForCurr = true;
      }
      continue;
    }

    const hasDate = DATE_RANGE.test(trimmed);
    const hasSep = /\s(?:at|@|[|–—-])\s/i.test(trimmed);
    const startNew = !curr || sawBulletForCurr || (hasDate && !!curr.date_range);

    if (startNew) {
      pushCurr();
      curr = {
        id: crypto.randomUUID(),
        name: "",
        role_title: "",
        date_range: "",
        bullets: [],
      };
      sawBulletForCurr = false;
    }

    if (!curr) continue;
    if (!curr.date_range) {
      const dateMatch = trimmed.match(DATE_RANGE);
      if (dateMatch) curr.date_range = dateMatch[0].trim();
    }

    const withoutDate = curr.date_range && trimmed.includes(curr.date_range) ? trimmed.replace(curr.date_range, "").trim() : trimmed;
    const cleaned = withoutDate.replace(/[|–—-]\s*$/, "").trim();

    if (cleaned) {
      if (!curr.role_title && !curr.name) {
        const parts = cleaned.split(/\s(?:at|@)\s|\s[|–—]\s|\s-\s/i).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          curr.role_title = parts[0];
          curr.name = parts[1];
        } else {
          curr.name = cleaned;
        }
      } else if (!curr.role_title && cleaned !== curr.name) {
        curr.role_title = cleaned;
      }
    }
  }
  pushCurr();

  return items;
}

/** Convenience used by the analyzer: all keywords present in a profile. */
export function profileKeywords(profile: MasterProfile): string[] {
  const corpus = [
    profile.summary,
    ...profile.skills,
    ...profile.experiences.flatMap((e) => [e.role_title, e.company, ...e.bullets.map((b) => b.text)]),
    ...profile.projects.flatMap((p) => [p.role_title, p.name, ...p.bullets.map((b) => b.text)]),
  ].join(" \n ");
  const fromText = extractKeywords(corpus, 80);
  const fromSkills = profile.skills.map((s) => s.toLowerCase());
  return [...new Set([...fromSkills, ...fromText])];
}
