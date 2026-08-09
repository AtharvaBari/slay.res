import {
  MasterProfile,
  Experience,
  Education,
  Project,
  Bullet,
  Contact,
  CustomItem,
  CustomSection,
} from "./schema";

/* Client-side helpers for building, editing, and reconciling the user's
 * Master Profile (the "details" they enter by hand, optionally merged with an
 * uploaded resume). Every experience/bullet keeps a stable unique id so the
 * downstream JD alignment stays traceable. */

let counter = 1;
export function makeId(prefix: string): string {
  return `${prefix}${counter++}`;
}

export function emptyProfile(): MasterProfile {
  return {
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    summary: "",
    experiences: [],
    projects: [],
    custom_sections: [],
    education: [],
    skills: [],
    section_order: ["summary", "experiences", "projects", "education", "skills"],
  };
}

export function newBullet(): Bullet {
  return { id: makeId("b"), text: "" };
}

export function newExperience(): Experience {
  return {
    id: makeId("exp"),
    company: "",
    role_title: "",
    date_range: "",
    bullets: [newBullet()],
  };
}

export function newProject(): Project {
  return {
    id: makeId("proj"),
    name: "",
    role_title: "",
    date_range: "",
    bullets: [newBullet()],
  };
}

export function newCustomItem(): CustomItem {
  return {
    id: makeId("citem"),
    name: "",
    role_title: "",
    date_range: "",
    bullets: [newBullet()],
  };
}

export function newCustomSection(): CustomSection {
  return {
    id: makeId("csec"),
    section_title: "New Section",
    items: [newCustomItem()],
  };
}

export function newEducation(): Education {
  return { id: makeId("edu"), institution: "", degree: "", date_range: "" };
}

/** Guarantee every id is present and unique before sending to /api/analyze. */
export function ensureUniqueIds(p: MasterProfile): MasterProfile {
  const seen = new Set<string>();
  const uniq = (id: string, pfx: string) => {
    let x = id || makeId(pfx);
    while (seen.has(x)) x = makeId(pfx);
    seen.add(x);
    return x;
  };
  return {
    ...p,
    experiences: p.experiences.map((e) => {
      const eid = uniq(e.id, "exp");
      return { ...e, id: eid, bullets: e.bullets.map((b) => ({ ...b, id: uniq(b.id, eid + "b") })) };
    }),
    projects: p.projects.map((p) => {
      const pid = uniq(p.id, "proj");
      return { ...p, id: pid, bullets: p.bullets.map((b) => ({ ...b, id: uniq(b.id, pid + "b") })) };
    }),
    custom_sections: p.custom_sections.map((sec) => {
      const secid = uniq(sec.id, "csec");
      return {
        ...sec,
        id: secid,
        items: sec.items.map((it) => {
          const itid = uniq(it.id, secid + "it");
          return { ...it, id: itid, bullets: it.bullets.map((b) => ({ ...b, id: uniq(b.id, itid + "b") })) };
        }),
      };
    }),
    education: p.education.map((ed) => ({ ...ed, id: uniq(ed.id, "edu") })),
  };
}

/** True once the profile has enough to align against a JD. */
export function profileHasContent(p: MasterProfile): boolean {
  return (
    !!p.contact.name.trim() ||
    p.experiences.some((e) => e.bullets.some((b) => b.text.trim())) ||
    p.projects.some((pr) => pr.bullets.some((b) => b.text.trim())) ||
    p.custom_sections.some((sec) => sec.items.some((it) => it.bullets.some((b) => b.text.trim()))) ||
    p.skills.length > 0
  );
}

/* ------------------------------------------------------------------ *
 *  Reconciliation — compare an uploaded/parsed resume against the
 *  details the user entered and surface what's new or fillable.
 * ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const expKey = (e: { role_title: string; company: string }) => norm(e.role_title + "|" + e.company);
const projKey = (p: { name: string; role_title: string }) => norm(p.name + "|" + p.role_title);
const eduKey = (e: { institution: string }) => norm(e.institution);
const csecKey = (sec: { section_title: string }) => norm(sec.section_title);

const CONTACT_LABELS: Record<keyof Omit<Contact, "links">, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  location: "Location",
};

export interface ContactFill {
  key: keyof Omit<Contact, "links">;
  label: string;
  value: string;
}

export interface Reconciliation {
  contactFills: ContactFill[];
  newLinks: string[];
  newExperiences: Experience[];
  newProjects: Project[];
  newCustomSections: CustomSection[];
  newEducation: Education[];
  newSkills: string[];
  matchedExperiences: number;
  matchedProjects: number;
  matchedSkills: number;
  isEmptyDetails: boolean;
}

export function reconcile(details: MasterProfile, parsed: MasterProfile): Reconciliation {
  const contactFills: ContactFill[] = [];
  (Object.keys(CONTACT_LABELS) as (keyof Omit<Contact, "links">)[]).forEach((key) => {
    const has = details.contact[key]?.trim();
    const found = parsed.contact[key]?.trim();
    if (!has && found) contactFills.push({ key, label: CONTACT_LABELS[key], value: found });
  });

  const existingLinks = new Set(details.contact.links.map(norm));
  const newLinks = parsed.contact.links.filter((l) => !existingLinks.has(norm(l)));

  const existingExp = new Set(details.experiences.map(expKey));
  const newExperiences = parsed.experiences.filter((e) => (e.role_title || e.company) && !existingExp.has(expKey(e)));
  const matchedExperiences = parsed.experiences.length - newExperiences.length;

  const existingProj = new Set(details.projects.map(projKey));
  const newProjects = parsed.projects.filter((p) => p.name && !existingProj.has(projKey(p)));
  const matchedProjects = parsed.projects.length - newProjects.length;

  const existingCsec = new Set(details.custom_sections.map(csecKey));
  const newCustomSections = parsed.custom_sections.filter((s) => s.section_title && !existingCsec.has(csecKey(s)));

  const existingEdu = new Set(details.education.map(eduKey));
  const newEducation = parsed.education.filter((e) => e.institution && !existingEdu.has(eduKey(e)));

  const existingSkills = new Set(details.skills.map(norm));
  const newSkills = parsed.skills.filter((s) => !existingSkills.has(norm(s)));
  const matchedSkills = parsed.skills.length - newSkills.length;

  return {
    contactFills,
    newLinks,
    newExperiences,
    newProjects,
    newCustomSections,
    newEducation,
    newSkills,
    matchedExperiences,
    matchedProjects,
    matchedSkills,
    isEmptyDetails: !profileHasContent(details),
  };
}

export interface ReconcileSelection {
  contactKeys: Set<string>;
  links: Set<string>;
  experienceIds: Set<string>;
  projectIds: Set<string>;
  customSectionIds: Set<string>;
  educationIds: Set<string>;
  skills: Set<string>;
}

export function applyReconcile(
  details: MasterProfile,
  parsed: MasterProfile,
  rec: Reconciliation,
  sel: ReconcileSelection
): MasterProfile {
  const contact: Contact = { ...details.contact };
  for (const f of rec.contactFills) {
    if (sel.contactKeys.has(f.key)) contact[f.key] = f.value;
  }
  const addedLinks = rec.newLinks.filter((l) => sel.links.has(l));
  contact.links = [...details.contact.links, ...addedLinks];

  const addedExp = rec.newExperiences.filter((e) => sel.experienceIds.has(e.id));
  const addedProj = rec.newProjects.filter((p) => sel.projectIds.has(p.id));
  const addedCsec = rec.newCustomSections.filter((s) => sel.customSectionIds.has(s.id));
  const addedEdu = rec.newEducation.filter((e) => sel.educationIds.has(e.id));
  const addedSkills = rec.newSkills.filter((s) => sel.skills.has(s));

  // Merge section_order: if the parsed profile has a custom section that the user selected,
  // we add `custom:${section_title}` to the section_order if it isn't there already.
  let newSectionOrder = [...(details.section_order || ["summary", "experiences", "projects", "education", "skills"])];
  addedCsec.forEach((sec) => {
    const sectionKey = `custom:${sec.section_title}`;
    if (!newSectionOrder.includes(sectionKey)) {
      // Find where it was in the parsed section_order
      const parsedKey = `custom:${sec.section_title}`;
      const parsedOrder = parsed.section_order || [];
      const parsedIndex = parsedOrder.indexOf(parsedKey);
      
      // Heuristic: Place it just before skills if we don't know where it belongs,
      // or try to match its relative order from the parsed resume if we can.
      const skillsIdx = newSectionOrder.indexOf("skills");
      if (skillsIdx !== -1) {
         newSectionOrder.splice(skillsIdx, 0, sectionKey);
      } else {
         newSectionOrder.push(sectionKey);
      }
    }
  });

  return {
    ...details,
    contact,
    summary: details.summary || parsed.summary,
    experiences: [...details.experiences, ...addedExp],
    projects: [...details.projects, ...addedProj],
    custom_sections: [...details.custom_sections, ...addedCsec],
    education: [...details.education, ...addedEdu],
    skills: [...details.skills, ...addedSkills],
    section_order: newSectionOrder,
  };
}
