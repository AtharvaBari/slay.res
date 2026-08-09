import type { MasterProfile, AlignmentResult } from "@/lib/schema";

export type TemplateId = 
  | "modern"
  | "classic"
  | "minimal"
  | "compact"
  | "executive"
  | "creative"
  | "technical"
  | "elegant"
  | "bold"
  | "academic"
  | "startup"
  | "corporate"
  | "clean"
  | "monochrome"
  | "professional";

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: "modern", label: "Modern", description: "Sans-serif, violet accents" },
  { id: "classic", label: "Classic", description: "Serif, centered, traditional" },
  { id: "minimal", label: "Minimal", description: "Monochrome, airy" },
  { id: "compact", label: "Compact", description: "Dense, one-page" },
  { id: "executive", label: "Executive", description: "Dark blue accents, highly formal" },
  { id: "creative", label: "Creative", description: "Vibrant teal, rounded aesthetics" },
  { id: "technical", label: "Technical", description: "Monospace elements, stark contrast" },
  { id: "elegant", label: "Elegant", description: "Thin serifs, spacious layout" },
  { id: "bold", label: "Bold", description: "Heavy typography, strong borders" },
  { id: "academic", label: "Academic", description: "Dense serif, research focused" },
  { id: "startup", label: "Startup", description: "Modern Inter, bright blue accents" },
  { id: "corporate", label: "Corporate", description: "Safe, neutral grays, standard" },
  { id: "clean", label: "Clean", description: "No borders, maximum readability" },
  { id: "monochrome", label: "Monochrome", description: "Pure black and white" },
  { id: "professional", label: "Professional", description: "Subtle slate accents, balanced" },
];

interface DocExp {
  role: string;
  company: string;
  date: string;
  bullets: { text: string; score?: number }[];
}
interface DocCustomSection {
  title: string;
  items: DocExp[];
}
interface DocData {
  name: string;
  contactBits: string[];
  summary: string;
  experiences: DocExp[];
  projects: DocExp[];
  custom_sections: DocCustomSection[];
  education: { institution: string; degree: string; date: string }[];
  skills: string[];
}

/** Flatten a profile (+ optional tailored result) into template-ready data. */
export function toDocData(profile: MasterProfile, result?: AlignmentResult | null): DocData {
  const c = profile.contact;
  const experiences: DocExp[] = result
    ? result.experiences.map((e) => ({
        role: e.role_title,
        company: e.company,
        date: e.date_range,
        bullets: e.bullet_points.map((b) => ({ text: b.tailored_text, score: b.semantic_score })),
      }))
    : profile.experiences.map((e) => ({
        role: e.role_title,
        company: e.company,
        date: e.date_range,
        bullets: e.bullets.map((b) => ({ text: b.text })).filter(b => !!b.text),
      }));

  const projects: DocExp[] = (result?.projects ?? [])?.length > 0
    ? result!.projects.map((p) => ({
        role: p.role_title,
        company: p.name,
        date: p.date_range,
        bullets: p.bullet_points.map((b) => ({ text: b.tailored_text, score: b.semantic_score })),
      }))
    : profile.projects.map((p) => ({
        role: p.role_title,
        company: p.name,
        date: p.date_range,
        bullets: p.bullets.map((b) => ({ text: b.text })).filter(b => !!b.text),
      }));

  const custom_sections: DocCustomSection[] = result?.custom_sections && result.custom_sections.length > 0
    ? result.custom_sections.map((sec) => ({
        title: sec.section_title,
        items: sec.items.map((it) => ({
          role: it.role_title,
          company: it.name,
          date: it.date_range,
          bullets: it.bullet_points.map((b) => ({ text: b.tailored_text, score: b.semantic_score })),
        }))
      }))
    : profile.custom_sections.map((sec) => ({
        title: sec.section_title,
        items: sec.items.map((it) => ({
          role: it.role_title,
          company: it.name,
          date: it.date_range,
          bullets: it.bullets.map((b) => ({ text: b.text })).filter(b => !!b.text),
        }))
      }));

  return {
    name: c.name || "Your Name",
    contactBits: [c.email, c.phone, c.location, ...c.links].filter(Boolean),
    summary: (result?.tailored_summary || profile.summary || "").trim(),
    experiences,
    projects,
    custom_sections,
    education: profile.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      date: e.date_range,
    })),
    skills: result?.verified_skills?.length ? result.verified_skills : profile.skills,
  };
}

/** Renders a resume in the chosen template. Add `className="resume-sheet"` at
 * the call site to mark the node that Download prints. */
export function ResumeDoc({
  profile,
  result,
  template,
  className = "",
  showHeatmap = false,
}: {
  profile: MasterProfile;
  result?: AlignmentResult | null;
  template: TemplateId;
  className?: string;
  showHeatmap?: boolean;
}) {
  const d = toDocData(profile, result);
  const t = STYLES[template];
  const order = profile.section_order || ["summary", "experiences", "projects", "education", "skills"];

  const renderSection = (key: string) => {
    if (key === "summary" && d.summary) {
      return (
        <Section key={key} t={t} title="Summary">
          <p className={t.summary}>{d.summary}</p>
        </Section>
      );
    }
    if (key === "experiences" && d.experiences.length > 0) {
      return (
        <Section key={key} t={t} title="Experience">
          <div className={t.expList}>
            {d.experiences.map((e, i) => (
              <div key={i} className={t.expItem}>
                <div className={t.expHead}>
                  <span className={t.role}>{[e.role?.trim(), e.company?.trim()].filter(Boolean).join(t.roleSep)}</span>
                  {e.date && <span className={t.date}>{e.date}</span>}
                </div>
                {e.bullets.length > 0 && (
                  <ul className={t.bullets}>
                    {e.bullets.map((b, j) => (
                      <li key={j} style={showHeatmap && b.score ? { backgroundColor: `rgba(34, 197, 94, ${Math.min(b.score * 1.5, 0.4)})` } : {}}>
                        {b.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      );
    }
    if (key === "projects" && d.projects.length > 0) {
      return (
        <Section key={key} t={t} title="Projects">
          <div className={t.expList}>
            {d.projects.map((p, i) => (
              <div key={i} className={t.expItem}>
                <div className={t.expHead}>
                  <span className={t.role}>{[p.role?.trim(), p.company?.trim()].filter(Boolean).join(t.roleSep)}</span>
                  {p.date && <span className={t.date}>{p.date}</span>}
                </div>
                {p.bullets.length > 0 && (
                  <ul className={t.bullets}>
                    {p.bullets.map((b, j) => (
                      <li key={j} style={showHeatmap && b.score ? { backgroundColor: `rgba(34, 197, 94, ${Math.min(b.score * 1.5, 0.4)})` } : {}}>
                        {b.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      );
    }
    if (key === "education" && d.education.length > 0) {
      return (
        <Section key={key} t={t} title="Education">
          <ul className={t.eduList}>
            {d.education.map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{e.institution}</span>
                {e.degree ? ` — ${e.degree}` : ""}
                {e.date ? <span className={t.date}> ({e.date})</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      );
    }
    if (key === "skills" && d.skills.length > 0) {
      return (
        <Section key={key} t={t} title="Skills">
          <p className={t.skills}>{d.skills.join(t.skillSep)}</p>
        </Section>
      );
    }
    if (key.startsWith("custom:")) {
      const title = key.replace("custom:", "");
      const sec = d.custom_sections.find(s => s.title === title);
      if (sec && sec.items.length > 0) {
        return (
          <Section key={key} t={t} title={title}>
            <div className={t.expList}>
              {sec.items.map((it, i) => (
                <div key={i} className={t.expItem}>
                  <div className={t.expHead}>
                    <span className={t.role}>{[it.role?.trim(), it.company?.trim()].filter(Boolean).join(t.roleSep)}</span>
                    {it.date && <span className={t.date}>{it.date}</span>}
                  </div>
                  {it.bullets.length > 0 && (
                    <ul className={t.bullets}>
                      {it.bullets.map((b, j) => (
                        <li key={j} style={showHeatmap && b.score ? { backgroundColor: `rgba(34, 197, 94, ${Math.min(b.score * 1.5, 0.4)})` } : {}}>
                          {b.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        );
      }
    }
    return null;
  };

  return (
    <div className={`${t.root} ${className}`} style={{ background: "#fff", color: "#111827" }}>
      {/* Header */}
      <header className={t.header}>
        <h1 className={t.name}>{d.name}</h1>
        {d.contactBits.length > 0 && (
          <div className={t.contact}>{d.contactBits.join("  ·  ")}</div>
        )}
      </header>

      {order.map(renderSection)}
    </div>
  );
}

function Section({ t, title, children }: { t: Style; title: string; children: React.ReactNode }) {
  return (
    <section className={t.section}>
      <div className={t.heading}>{t.headingTransform(title)}</div>
      {children}
    </section>
  );
}

export interface Style {
  root: string;
  header: string;
  name: string;
  contact: string;
  section: string;
  heading: string;
  headingTransform: (s: string) => string;
  summary: string;
  expList: string;
  expItem: string;
  expHead: string;
  role: string;
  roleSep: string;
  date: string;
  bullets: string;
  eduList: string;
  skills: string;
  skillSep: string;
}

export const STYLES: Record<TemplateId, Style> = {
  modern: {
    root: "font-sans text-[14px] leading-relaxed text-slate-800",
    header: "mb-5",
    name: "text-3xl font-black tracking-tight text-slate-900",
    contact: "mt-1.5 text-[12px] text-slate-500",
    section: "mb-5",
    heading:
      "mb-2.5 inline-block border-b-2 border-violet-500 pb-0.5 text-[13px] font-bold uppercase tracking-widest text-violet-700",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-700",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14.5px] font-bold text-slate-900",
    roleSep: " — ",
    date: "shrink-0 text-[12.5px] font-medium text-slate-500",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-slate-700 marker:text-violet-400",
    eduList: "space-y-1 text-[13.5px] text-slate-700",
    skills: "text-[13.5px] text-slate-700",
    skillSep: "  ·  ",
  },
  classic: {
    root: "font-serif text-[14px] leading-relaxed text-slate-900",
    header: "mb-5 text-center",
    name: "text-[32px] font-bold tracking-wide text-slate-900",
    contact: "mt-1.5 text-[12.5px] text-slate-600",
    section: "mb-5",
    heading:
      "mb-2.5 border-b border-slate-400 pb-0.5 text-[13.5px] font-bold uppercase tracking-[0.2em] text-slate-800",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-800",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-bold text-slate-900",
    roleSep: ", ",
    date: "shrink-0 text-[12.5px] italic text-slate-600",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-slate-800",
    eduList: "space-y-1 text-[13.5px] text-slate-800",
    skills: "text-[14px] leading-relaxed text-slate-800",
    skillSep: ", ",
  },
  minimal: {
    root: "font-sans text-[14px] leading-loose text-slate-800",
    header: "mb-7",
    name: "text-[28px] font-semibold tracking-tight text-slate-900",
    contact: "mt-1.5 text-[12.5px] text-slate-400",
    section: "mb-7",
    heading: "mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.28em] text-slate-400",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-600",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-semibold text-slate-900",
    roleSep: " · ",
    date: "shrink-0 text-[12.5px] text-slate-400",
    bullets: "mt-1.5 list-none space-y-1.5 text-[13.5px] text-slate-600",
    eduList: "space-y-1 text-[13.5px] text-slate-600",
    skills: "text-[14px] leading-relaxed text-slate-600",
    skillSep: "   ",
  },
  compact: {
    root: "font-sans text-[13px] leading-snug text-slate-800",
    header: "mb-4 flex items-baseline justify-between gap-4 border-b border-slate-300 pb-2.5",
    name: "text-2xl font-extrabold tracking-tight text-slate-900",
    contact: "text-right text-[12px] text-slate-500 max-w-[55%]",
    section: "mb-3",
    heading: "mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-800",
    headingTransform: (s) => s,
    summary: "text-[13px] leading-snug text-slate-700",
    expList: "space-y-2.5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[13.5px] font-bold text-slate-900",
    roleSep: " — ",
    date: "shrink-0 text-[12px] text-slate-500",
    bullets: "mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-700",
    eduList: "space-y-1 text-[12.5px] text-slate-700",
    skills: "text-[12.5px] leading-relaxed text-slate-700",
    skillSep: "  ·  ",
  },
  executive: {
    root: "font-serif text-[13.5px] leading-relaxed text-slate-900",
    header: "mb-6 text-center border-b-4 border-slate-900 pb-4",
    name: "text-3xl font-bold tracking-tight text-slate-900",
    contact: "mt-1.5 text-[12px] text-slate-600",
    section: "mb-5",
    heading: "mb-2 border-b-2 border-slate-800 pb-0.5 text-[14px] font-bold uppercase tracking-widest text-slate-900",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-800",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14.5px] font-bold text-slate-900",
    roleSep: ", ",
    date: "shrink-0 text-[12.5px] font-semibold text-slate-700",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-slate-800",
    eduList: "space-y-1 text-[13.5px] text-slate-800",
    skills: "text-[13.5px] leading-relaxed text-slate-800",
    skillSep: " | ",
  },
  creative: {
    root: "font-sans text-[14px] leading-relaxed text-slate-800",
    header: "mb-6 flex flex-col items-start border-l-4 border-teal-500 pl-4",
    name: "text-4xl font-extrabold tracking-tight text-slate-900",
    contact: "mt-1.5 text-[12.5px] text-slate-500 font-medium",
    section: "mb-6",
    heading: "mb-3 inline-block rounded-md bg-teal-50 px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-teal-700",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-700",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-bold text-slate-900",
    roleSep: " • ",
    date: "shrink-0 text-[12.5px] font-semibold text-teal-600",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-slate-700 marker:text-teal-400",
    eduList: "space-y-1.5 text-[13.5px] text-slate-700",
    skills: "text-[13.5px] font-medium text-slate-700",
    skillSep: "   ",
  },
  technical: {
    root: "font-sans text-[13.5px] leading-relaxed text-zinc-900",
    header: "mb-6 flex items-baseline justify-between border-b-2 border-zinc-900 pb-3",
    name: "text-2xl font-black tracking-tight text-zinc-900",
    contact: "text-right text-[12px] font-mono text-zinc-600",
    section: "mb-5",
    heading: "mb-2 bg-zinc-900 px-2 py-0.5 text-[12px] font-mono font-bold uppercase tracking-wider text-white",
    headingTransform: (s) => `~/ ${s}`,
    summary: "text-[13.5px] leading-relaxed text-zinc-800",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14px] font-bold text-zinc-900",
    roleSep: " :: ",
    date: "shrink-0 text-[12px] font-mono text-zinc-500",
    bullets: "mt-1.5 list-square space-y-1 pl-4 text-[13px] text-zinc-800",
    eduList: "space-y-1 text-[13px] text-zinc-800",
    skills: "text-[12.5px] font-mono text-zinc-800",
    skillSep: " > ",
  },
  elegant: {
    root: "font-serif text-[14px] leading-loose text-gray-800",
    header: "mb-8 text-center",
    name: "text-4xl font-light tracking-wide text-gray-900",
    contact: "mt-2 text-[12px] uppercase tracking-widest text-gray-500",
    section: "mb-6",
    heading: "mb-4 text-center text-[12px] font-normal uppercase tracking-[0.3em] text-gray-400",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-gray-600 text-center mx-auto max-w-2xl",
    expList: "space-y-6",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-medium text-gray-900",
    roleSep: " | ",
    date: "shrink-0 text-[12px] italic text-gray-400",
    bullets: "mt-2 list-none space-y-1.5 text-[13.5px] text-gray-600",
    eduList: "space-y-2 text-[13.5px] text-gray-600",
    skills: "text-[13.5px] text-gray-600 text-center",
    skillSep: "   ·   ",
  },
  bold: {
    root: "font-sans text-[14px] leading-relaxed text-black",
    header: "mb-6 flex flex-col border-l-8 border-black pl-4",
    name: "text-5xl font-black uppercase tracking-tighter text-black",
    contact: "mt-2 text-[13px] font-bold text-gray-700",
    section: "mb-6",
    heading: "mb-2 text-[18px] font-black uppercase tracking-tight text-black",
    headingTransform: (s) => s,
    summary: "text-[14px] font-medium leading-relaxed text-gray-800",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-black text-black",
    roleSep: " — ",
    date: "shrink-0 text-[13px] font-bold text-gray-500",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[14px] font-medium text-gray-800",
    eduList: "space-y-1 text-[14px] font-bold text-gray-800",
    skills: "text-[14px] font-bold text-gray-800",
    skillSep: " / ",
  },
  academic: {
    root: "font-serif text-[13px] leading-snug text-gray-900",
    header: "mb-5 text-center",
    name: "text-2xl font-bold text-gray-900",
    contact: "mt-1 text-[12px] text-gray-700",
    section: "mb-4",
    heading: "mb-1.5 border-b border-gray-400 pb-0.5 text-[13px] font-bold uppercase text-gray-900",
    headingTransform: (s) => s,
    summary: "text-[13px] leading-snug text-gray-800",
    expList: "space-y-3",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[13.5px] font-bold text-gray-900",
    roleSep: ", ",
    date: "shrink-0 text-[12.5px] text-gray-700",
    bullets: "mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-gray-800",
    eduList: "space-y-1 text-[13px] text-gray-800",
    skills: "text-[13px] leading-snug text-gray-800",
    skillSep: ", ",
  },
  startup: {
    root: "font-sans text-[14px] leading-relaxed text-slate-700",
    header: "mb-6",
    name: "text-3xl font-extrabold tracking-tight text-blue-600",
    contact: "mt-1.5 text-[12.5px] font-medium text-slate-500",
    section: "mb-6",
    heading: "mb-3 text-[14px] font-bold text-blue-600 border-b-2 border-blue-100 pb-1",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-600",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-3",
    role: "text-[15px] font-bold text-slate-800",
    roleSep: " at ",
    date: "shrink-0 text-[12.5px] font-medium text-slate-400",
    bullets: "mt-2 list-disc space-y-1.5 pl-4 text-[13.5px] text-slate-600",
    eduList: "space-y-1.5 text-[13.5px] text-slate-600",
    skills: "text-[13.5px] font-medium text-slate-600",
    skillSep: " · ",
  },
  corporate: {
    root: "font-sans text-[13.5px] leading-relaxed text-gray-800",
    header: "mb-5 border-b border-gray-300 pb-4",
    name: "text-3xl font-bold tracking-tight text-gray-900",
    contact: "mt-1 text-[12px] text-gray-500",
    section: "mb-5",
    heading: "mb-2 text-[13px] font-bold uppercase tracking-wider text-gray-500",
    headingTransform: (s) => s,
    summary: "text-[13.5px] leading-relaxed text-gray-700",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14.5px] font-semibold text-gray-900",
    roleSep: " - ",
    date: "shrink-0 text-[12.5px] text-gray-500",
    bullets: "mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-gray-700",
    eduList: "space-y-1 text-[13.5px] text-gray-700",
    skills: "text-[13.5px] text-gray-700",
    skillSep: " | ",
  },
  clean: {
    root: "font-sans text-[14px] leading-relaxed text-gray-800",
    header: "mb-6",
    name: "text-3xl font-medium tracking-tight text-gray-900",
    contact: "mt-1 text-[12.5px] text-gray-500",
    section: "mb-6",
    heading: "mb-3 text-[14px] font-semibold text-gray-900",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-gray-600",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14px] font-medium text-gray-900",
    roleSep: ", ",
    date: "shrink-0 text-[12.5px] text-gray-500",
    bullets: "mt-1.5 list-disc space-y-1 pl-4 text-[13.5px] text-gray-600",
    eduList: "space-y-1 text-[13.5px] text-gray-600",
    skills: "text-[13.5px] text-gray-600",
    skillSep: "   ",
  },
  monochrome: {
    root: "font-sans text-[13.5px] leading-relaxed text-black",
    header: "mb-6 flex items-end justify-between border-b-4 border-black pb-4",
    name: "text-4xl font-black uppercase tracking-tighter text-black",
    contact: "text-right text-[12px] font-bold text-gray-600",
    section: "mb-5",
    heading: "mb-2 inline-block bg-black px-2 py-0.5 text-[13px] font-bold uppercase tracking-widest text-white",
    headingTransform: (s) => s,
    summary: "text-[13.5px] font-medium leading-relaxed text-black",
    expList: "space-y-4",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[14.5px] font-black text-black",
    roleSep: " // ",
    date: "shrink-0 text-[12px] font-bold uppercase text-gray-600",
    bullets: "mt-1.5 list-square space-y-1 pl-4 text-[13.5px] font-medium text-gray-800",
    eduList: "space-y-1 text-[13.5px] font-bold text-gray-800",
    skills: "text-[13.5px] font-bold text-gray-800",
    skillSep: "   ",
  },
  professional: {
    root: "font-sans text-[14px] leading-relaxed text-slate-800",
    header: "mb-6 text-center",
    name: "text-3xl font-semibold tracking-tight text-slate-900",
    contact: "mt-1.5 text-[12.5px] text-slate-500",
    section: "mb-5",
    heading: "mb-3 flex items-center gap-4 text-[14px] font-semibold text-slate-900 after:h-px after:flex-1 after:bg-slate-200",
    headingTransform: (s) => s,
    summary: "text-[14px] leading-relaxed text-slate-700",
    expList: "space-y-5",
    expItem: "",
    expHead: "flex items-baseline justify-between gap-3",
    role: "text-[15px] font-semibold text-slate-900",
    roleSep: " | ",
    date: "shrink-0 text-[13px] text-slate-500",
    bullets: "mt-1.5 list-disc space-y-1.5 pl-5 text-[13.5px] text-slate-700",
    eduList: "space-y-1 text-[13.5px] text-slate-700",
    skills: "text-[13.5px] text-slate-700",
    skillSep: " • ",
  }
};
