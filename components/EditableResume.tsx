"use client";

import { createContext, useContext } from "react";
import { Plus, X } from "lucide-react";
import type { MasterProfile, AlignmentResult } from "@/lib/schema";
import { STYLES, type TemplateId } from "@/components/ResumeDoc";

/** Whether fields are currently editable. Lets the same tree render as a clean
 * read-only resume or a fully editable one without remounting nodes. */
const EditCtx = createContext(true);

/* The working model the Results page owns and this component edits in place.
 * `headings` overrides the default section labels (custom sections edit their
 * own title on the result). */
export interface ResumeWork {
  profile: MasterProfile;
  result: AlignmentResult;
  template: TemplateId;
  headings: Record<string, string>;
}

const DEFAULT_HEADINGS: Record<string, string> = {
  summary: "Summary",
  experiences: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

/** A single inline-editable text node. Commits on blur (reads innerText), so
 * React never re-renders mid-typing → the caret never jumps. */
function Editable({
  value,
  onCommit,
  className = "",
  placeholder,
  tag = "span",
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  tag?: "span" | "div" | "h1" | "p";
}) {
  const Tag = tag as any;
  const editable = useContext(EditCtx);
  if (!editable) {
    return <Tag className={className}>{value}</Tag>;
  }
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      className={`editable ${className}`}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.innerText.replace(/ /g, " ").trim();
        if (next !== value) onCommit(next);
      }}
    >
      {value}
    </Tag>
  );
}

/** Fully inline-editable resume. Identical layout/typography to ResumeDoc
 * (shares STYLES), but every text is editable and every edit flows back into
 * the working model via setWork. Mark the outer node `resume-sheet` at the call
 * site so Download (print) captures exactly this. */
export default function EditableResume({
  work,
  setWork,
  editable = true,
  className = "",
}: {
  work: ResumeWork;
  setWork: (updater: (w: ResumeWork) => ResumeWork) => void;
  editable?: boolean;
  className?: string;
}) {
  const { profile, result, template, headings } = work;
  const t = STYLES[template];
  const order = profile.section_order?.length
    ? profile.section_order
    : ["summary", "experiences", "projects", "education", "skills"];

  /* ---- mutators (immutable) ---- */
  const setProfile = (fn: (p: MasterProfile) => MasterProfile) =>
    setWork((w) => ({ ...w, profile: fn(w.profile) }));
  const setResult = (fn: (r: AlignmentResult) => AlignmentResult) =>
    setWork((w) => ({ ...w, result: fn(w.result) }));

  const setName = (v: string) =>
    setProfile((p) => ({ ...p, contact: { ...p.contact, name: v } }));
  const setContact = (k: "email" | "phone" | "location", v: string) =>
    setProfile((p) => ({ ...p, contact: { ...p.contact, [k]: v } }));
  const setLink = (i: number, v: string) =>
    setProfile((p) => ({
      ...p,
      contact: { ...p.contact, links: p.contact.links.map((l, j) => (j === i ? v : l)).filter((l, j) => v !== "" || j !== i) },
    }));
  const setHeading = (key: string, v: string) =>
    setWork((w) => ({ ...w, headings: { ...w.headings, [key]: v } }));

  const setSummary = (v: string) => setResult((r) => ({ ...r, tailored_summary: v }));

  const setExp = (i: number, patch: Partial<AlignmentResult["experiences"][number]>) =>
    setResult((r) => ({ ...r, experiences: r.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const setExpBullet = (i: number, bi: number, v: string) =>
    setResult((r) => ({
      ...r,
      experiences: r.experiences.map((e, j) =>
        j === i ? { ...e, bullet_points: e.bullet_points.map((b, k) => (k === bi ? { ...b, tailored_text: v } : b)) } : e
      ),
    }));
  const addExpBullet = (i: number) =>
    setResult((r) => ({
      ...r,
      experiences: r.experiences.map((e, j) =>
        j === i ? { ...e, bullet_points: [...e.bullet_points, { source_bullet_id: `edit-${Date.now()}`, tailored_text: "", highlighted_keywords: [] }] } : e
      ),
    }));
  const removeExpBullet = (i: number, bi: number) =>
    setResult((r) => ({
      ...r,
      experiences: r.experiences.map((e, j) => (j === i ? { ...e, bullet_points: e.bullet_points.filter((_, k) => k !== bi) } : e)),
    }));

  const setProj = (i: number, patch: Partial<AlignmentResult["projects"][number]>) =>
    setResult((r) => ({ ...r, projects: r.projects.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const setProjBullet = (i: number, bi: number, v: string) =>
    setResult((r) => ({
      ...r,
      projects: r.projects.map((e, j) =>
        j === i ? { ...e, bullet_points: e.bullet_points.map((b, k) => (k === bi ? { ...b, tailored_text: v } : b)) } : e
      ),
    }));
  const addProjBullet = (i: number) =>
    setResult((r) => ({
      ...r,
      projects: r.projects.map((e, j) =>
        j === i ? { ...e, bullet_points: [...e.bullet_points, { source_bullet_id: `edit-${Date.now()}`, tailored_text: "", highlighted_keywords: [] }] } : e
      ),
    }));
  const removeProjBullet = (i: number, bi: number) =>
    setResult((r) => ({
      ...r,
      projects: r.projects.map((e, j) => (j === i ? { ...e, bullet_points: e.bullet_points.filter((_, k) => k !== bi) } : e)),
    }));

  const setCustomSection = (si: number, patch: Partial<AlignmentResult["custom_sections"][number]>) =>
    setResult((r) => ({ ...r, custom_sections: r.custom_sections.map((s, j) => (j === si ? { ...s, ...patch } : s)) }));
  const setCustomItem = (si: number, ii: number, patch: Partial<AlignmentResult["custom_sections"][number]["items"][number]>) =>
    setResult((r) => ({
      ...r,
      custom_sections: r.custom_sections.map((s, j) =>
        j === si ? { ...s, items: s.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : s
      ),
    }));
  const setCustomBullet = (si: number, ii: number, bi: number, v: string) =>
    setResult((r) => ({
      ...r,
      custom_sections: r.custom_sections.map((s, j) =>
        j === si
          ? { ...s, items: s.items.map((it, k) => (k === ii ? { ...it, bullet_points: it.bullet_points.map((b, m) => (m === bi ? { ...b, tailored_text: v } : b)) } : it)) }
          : s
      ),
    }));

  const setEdu = (i: number, k: "institution" | "degree" | "date_range", v: string) =>
    setProfile((p) => ({ ...p, education: p.education.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));

  const setSkill = (i: number, v: string) =>
    setResult((r) => {
      const list = r.verified_skills.length ? r.verified_skills : profile.skills;
      const next = list.map((s, j) => (j === i ? v : s)).filter((s) => s.trim() !== "");
      return { ...r, verified_skills: next };
    });
  const addSkill = () =>
    setResult((r) => ({ ...r, verified_skills: [...(r.verified_skills.length ? r.verified_skills : profile.skills), "New skill"] }));

  /* ---- data (prefer the tailored result) ---- */
  const contactBits: { key: "email" | "phone" | "location"; value: string; placeholder: string }[] = [
    { key: "email", value: profile.contact.email, placeholder: "email" },
    { key: "phone", value: profile.contact.phone, placeholder: "phone" },
    { key: "location", value: profile.contact.location, placeholder: "location" },
  ];
  const skills = result.verified_skills.length ? result.verified_skills : profile.skills;

  const heading = (key: string) => headings[key] ?? DEFAULT_HEADINGS[key] ?? key;

  const RemoveBtn = ({ onClick }: { onClick: () => void }) =>
    !editable ? null : (
    <button
      onClick={onClick}
      contentEditable={false}
      className="no-print ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 align-middle text-rose-500 opacity-0 transition group-hover/edit:opacity-100 hover:bg-rose-200"
      title="Remove"
      tabIndex={-1}
    >
      <X className="h-3 w-3" />
    </button>
  );

  const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) =>
    !editable ? null : (
    <button
      onClick={onClick}
      contentEditable={false}
      className="no-print mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] opacity-70 transition hover:opacity-100"
      tabIndex={-1}
    >
      <Plus className="h-3 w-3" /> {label}
    </button>
  );

  const renderSection = (key: string) => {
    if (key === "summary") {
      if (!result.tailored_summary.trim() && !editable) return null;
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>
            {t.headingTransform(heading("summary"))}
          </div>
          <Editable value={result.tailored_summary} onCommit={setSummary} className={t.summary} placeholder="Write a short professional summary…" tag="p" />
        </section>
      );
    }
    if (key === "experiences") {
      if (result.experiences.length === 0) return null;
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>{t.headingTransform(heading("experiences"))}</div>
          <div className={t.expList}>
            {result.experiences.map((e, i) => (
              <div key={i} className={`${t.expItem} resume-entry`}>
                <div className={t.expHead}>
                  <span className={t.role}>
                    <Editable value={e.role_title} onCommit={(v) => setExp(i, { role_title: v })} placeholder="Role" />
                    <span>{t.roleSep}</span>
                    <Editable value={e.company} onCommit={(v) => setExp(i, { company: v })} placeholder="Company" />
                  </span>
                  <Editable value={e.date_range} onCommit={(v) => setExp(i, { date_range: v })} className={t.date} placeholder="Dates" />
                </div>
                <ul className={t.bullets}>
                  {e.bullet_points.map((b, j) => (
                    <li key={j} className="group/edit">
                      <Editable value={b.tailored_text} onCommit={(v) => setExpBullet(i, j, v)} placeholder="Describe an accomplishment…" />
                      <RemoveBtn onClick={() => removeExpBullet(i, j)} />
                    </li>
                  ))}
                </ul>
                <AddBtn onClick={() => addExpBullet(i)} label="Add bullet" />
              </div>
            ))}
          </div>
        </section>
      );
    }
    if (key === "projects" && result.projects.length > 0) {
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>{t.headingTransform(heading("projects"))}</div>
          <div className={t.expList}>
            {result.projects.map((p, i) => (
              <div key={i} className={`${t.expItem} resume-entry`}>
                <div className={t.expHead}>
                  <span className={t.role}>
                    <Editable value={p.role_title} onCommit={(v) => setProj(i, { role_title: v })} placeholder="Role" />
                    {p.role_title || p.name ? <span>{t.roleSep}</span> : null}
                    <Editable value={p.name} onCommit={(v) => setProj(i, { name: v })} placeholder="Project" />
                  </span>
                  <Editable value={p.date_range} onCommit={(v) => setProj(i, { date_range: v })} className={t.date} placeholder="Dates" />
                </div>
                <ul className={t.bullets}>
                  {p.bullet_points.map((b, j) => (
                    <li key={j} className="group/edit">
                      <Editable value={b.tailored_text} onCommit={(v) => setProjBullet(i, j, v)} placeholder="Describe the project…" />
                      <RemoveBtn onClick={() => removeProjBullet(i, j)} />
                    </li>
                  ))}
                </ul>
                <AddBtn onClick={() => addProjBullet(i)} label="Add bullet" />
              </div>
            ))}
          </div>
        </section>
      );
    }
    if (key === "education" && profile.education.length > 0) {
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>{t.headingTransform(heading("education"))}</div>
          <ul className={t.eduList}>
            {profile.education.map((e, i) => (
              <li key={i}>
                <Editable value={e.institution} onCommit={(v) => setEdu(i, "institution", v)} className="font-semibold" placeholder="Institution" />
                {editable || e.degree.trim() ? <span> — </span> : null}
                {editable || e.degree.trim() ? (
                  <Editable value={e.degree} onCommit={(v) => setEdu(i, "degree", v)} placeholder="Degree" />
                ) : null}
                {editable || e.date_range.trim() ? <span> </span> : null}
                {editable || e.date_range.trim() ? (
                  <Editable value={e.date_range} onCommit={(v) => setEdu(i, "date_range", v)} className={t.date} placeholder="Dates" />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      );
    }
    if (key === "skills" && skills.length > 0) {
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>{t.headingTransform(heading("skills"))}</div>
          <p className={t.skills}>
            {skills.map((s, i) => (
              <span key={i}>
                <span className="group/edit whitespace-nowrap">
                  <Editable value={s} onCommit={(v) => setSkill(i, v)} placeholder="skill" />
                  <RemoveBtn onClick={() => setSkill(i, "")} />
                </span>
                {i < skills.length - 1 ? <span className="whitespace-pre-wrap">{t.skillSep}</span> : null}
              </span>
            ))}
            <AddBtn onClick={addSkill} label="Add skill" />
          </p>
        </section>
      );
    }
    if (key.startsWith("custom:")) {
      const title = key.replace("custom:", "");
      const si = result.custom_sections.findIndex((s) => s.section_title === title);
      if (si === -1) return null;
      const sec = result.custom_sections[si];
      if (!sec.items.length) return null;
      return (
        <section key={key} className={t.section}>
          <div className={t.heading}>
            <Editable value={sec.section_title} onCommit={(v) => setCustomSection(si, { section_title: v })} placeholder="Section title" />
          </div>
          <div className={t.expList}>
            {sec.items.map((it, ii) => (
              <div key={ii} className={`${t.expItem} resume-entry`}>
                <div className={t.expHead}>
                  <span className={t.role}>
                    <Editable value={it.role_title} onCommit={(v) => setCustomItem(si, ii, { role_title: v })} placeholder="Role" />
                    {it.role_title || it.name ? <span>{t.roleSep}</span> : null}
                    <Editable value={it.name} onCommit={(v) => setCustomItem(si, ii, { name: v })} placeholder="Name" />
                  </span>
                  <Editable value={it.date_range} onCommit={(v) => setCustomItem(si, ii, { date_range: v })} className={t.date} placeholder="Dates" />
                </div>
                {it.bullet_points.length > 0 && (
                  <ul className={t.bullets}>
                    {it.bullet_points.map((b, j) => (
                      <li key={j} className="group/edit">
                        <Editable value={b.tailored_text} onCommit={(v) => setCustomBullet(si, ii, j, v)} placeholder="Detail…" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }
    return null;
  };

  return (
    <EditCtx.Provider value={editable}>
    <div className={`${t.root} ${className}`} style={{ background: "#fff", color: "#111827" }}>
      <header className={t.header}>
        <Editable value={profile.contact.name} onCommit={setName} className={t.name} placeholder="Your Name" tag="h1" />
        <div className={t.contact}>
          {(() => {
            // In view mode only show fields that have content; in edit mode show
            // all three base fields (with placeholders) so they're fillable.
            const bits = editable ? contactBits : contactBits.filter((c) => c.value.trim());
            const links = profile.contact.links.filter((l) => editable || l.trim());
            const total = bits.length + links.length;
            let idx = 0;
            return (
              <>
                {bits.map((c) => {
                  const showSep = ++idx < total;
                  return (
                    <span key={c.key}>
                      <Editable value={c.value} onCommit={(v) => setContact(c.key, v)} placeholder={c.placeholder} />
                      {showSep ? <span>{"  ·  "}</span> : null}
                    </span>
                  );
                })}
                {links.map((l, i) => {
                  const showSep = ++idx < total;
                  return (
                    <span key={`link-${i}`} className="group/edit">
                      <Editable value={l} onCommit={(v) => setLink(i, v)} placeholder="link" />
                      {showSep ? <span>{"  ·  "}</span> : null}
                    </span>
                  );
                })}
              </>
            );
          })()}
        </div>
      </header>

      {order.map(renderSection)}
    </div>
    </EditCtx.Provider>
  );
}
