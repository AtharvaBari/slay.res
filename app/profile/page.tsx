"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  User,
  FileText,
  Briefcase,
  Rocket,
  ListPlus,
  GraduationCap,
  Sparkles,
  ArrowUpDown,
  Plus,
  Trash2,
  XCircle,
  Loader2,
  Cloud,
  UploadCloud,
  ClipboardPaste,
  Wand2,
  ArrowRight,
  CheckCircle2,
  Link2,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { MasterProfile } from "@/lib/schema";
import {
  emptyProfile,
  newExperience,
  newProject,
  newCustomSection,
  newCustomItem,
  newBullet,
  newEducation,
  ensureUniqueIds,
  profileHasContent,
  reconcile,
  applyReconcile,
} from "@/lib/profile";
import Navbar from "@/components/Navbar";

type SectionKey = "contact" | "summary" | "experiences" | "projects" | "custom" | "education" | "skills" | "order";

const NAV: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "contact", label: "Contact", icon: <User className="h-4 w-4" /> },
  { key: "summary", label: "Summary", icon: <FileText className="h-4 w-4" /> },
  { key: "experiences", label: "Work Experience", icon: <Briefcase className="h-4 w-4" /> },
  { key: "projects", label: "Projects", icon: <Rocket className="h-4 w-4" /> },
  { key: "custom", label: "Custom Sections", icon: <ListPlus className="h-4 w-4" /> },
  { key: "education", label: "Education", icon: <GraduationCap className="h-4 w-4" /> },
  { key: "skills", label: "Skills", icon: <Sparkles className="h-4 w-4" /> },
  { key: "order", label: "Section Order", icon: <ArrowUpDown className="h-4 w-4" /> },
];

const DEFAULT_ORDER = ["summary", "experiences", "projects", "education", "skills"];

export default function ProfilePage() {
  const { status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<MasterProfile>(emptyProfile());
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("modern");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [active, setActive] = useState<SectionKey>("contact");
  const [fetchOpen, setFetchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // Redirect signed-out users to login.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Load saved profile once.
  useEffect(() => {
    if (status !== "authenticated" || hydrated.current) return;
    hydrated.current = true;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const { data } = await res.json();
          if (data?.profile) {
            setProfile(ensureUniqueIds(data.profile));
            setJd(data.jd ?? "");
            setTemplate(data.template ?? "modern");
          }
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, [status]);

  function save(next: MasterProfile) {
    if (status !== "authenticated") return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: ensureUniqueIds(next), jd, template }),
        });
        setSaveState(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setSaveState("idle"), 1600);
      } catch {
        setSaveState("error");
      }
    }, 700);
  }

  function update(next: MasterProfile) {
    setProfile(next);
    save(next);
  }

  function importParsed(parsed: MasterProfile) {
    const clean = ensureUniqueIds(parsed);
    let merged = clean;
    let count = 0;
    if (profileHasContent(profile)) {
      const rec = reconcile(profile, clean);
      count =
        rec.contactFills.length +
        rec.newLinks.length +
        rec.newExperiences.length +
        rec.newProjects.length +
        rec.newCustomSections.length +
        rec.newEducation.length +
        rec.newSkills.length;
      merged = ensureUniqueIds(
        applyReconcile(profile, clean, rec, {
          contactKeys: new Set(rec.contactFills.map((f) => f.key as string)),
          links: new Set(rec.newLinks),
          experienceIds: new Set(rec.newExperiences.map((e) => e.id)),
          projectIds: new Set(rec.newProjects.map((p) => p.id)),
          customSectionIds: new Set(rec.newCustomSections.map((s) => s.id)),
          educationIds: new Set(rec.newEducation.map((e) => e.id)),
          skills: new Set(rec.newSkills),
        })
      );
    } else {
      count = -1; // replaced
    }
    update(merged);
    setFetchOpen(false);
    setToast(count === -1 ? "Resume imported into your profile." : `Merged ${count} item${count === 1 ? "" : "s"} from your resume.`);
    setTimeout(() => setToast(null), 3500);
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Title */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Profile</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your source of truth. Everything here is preserved verbatim when a resume is built from your details.
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Left nav */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <nav className="glass-panel space-y-1 p-2">
              {NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setActive(n.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                    active === n.key
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {n.icon}
                  <span className="flex-1">{n.label}</span>
                  <SectionCount profile={profile} sec={n.key} active={active === n.key} />
                </button>
              ))}
            </nav>

            <div className="mt-3 space-y-2">
              <button
                onClick={() => setFetchOpen(true)}
                className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
              >
                <UploadCloud className="h-4 w-4" /> Fetch from resume
              </button>
              <button
                onClick={() => {
                  if (confirm("Clear your entire profile? This cannot be undone.")) update(emptyProfile());
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" /> Clear data
              </button>
              <Link
                href="/dashboard"
                className="btn-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold"
              >
                Go to dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>

          {/* Active section editor */}
          <main className="glass min-h-[60vh] rounded-2xl p-5 sm:p-7">
            <SectionEditor active={active} profile={profile} onChange={update} />
          </main>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm text-slate-800 shadow-xl">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {toast}
        </div>
      )}

      {/* Fetch modal */}
      {fetchOpen && <FetchModal onClose={() => setFetchOpen(false)} onParsed={importParsed} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Save indicator + section counts                                   */
/* ------------------------------------------------------------------ */

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const map = {
    saving: { text: "Saving…", cls: "text-slate-500", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    saved: { text: "Saved", cls: "text-emerald-600", icon: <Cloud className="h-3.5 w-3.5" /> },
    error: { text: "Save failed", cls: "text-rose-600", icon: <XCircle className="h-3.5 w-3.5" /> },
  } as const;
  const s = map[state];
  return <span className={`flex items-center gap-1.5 text-xs font-medium ${s.cls}`}>{s.icon}{s.text}</span>;
}

function SectionCount({ profile, sec, active }: { profile: MasterProfile; sec: SectionKey; active: boolean }) {
  let n = 0;
  if (sec === "experiences") n = profile.experiences.length;
  else if (sec === "projects") n = profile.projects.length;
  else if (sec === "custom") n = profile.custom_sections.length;
  else if (sec === "education") n = profile.education.length;
  else if (sec === "skills") n = profile.skills.length;
  if (!n) return null;
  return (
    <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-slate-200 text-slate-500"}`}>
      {n}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Section editor — renders only the active section (big inputs)     */
/* ------------------------------------------------------------------ */

function SectionEditor({
  active,
  profile,
  onChange,
}: {
  active: SectionKey;
  profile: MasterProfile;
  onChange: (p: MasterProfile) => void;
}) {
  const p = profile;
  const order = p.section_order?.length ? p.section_order : DEFAULT_ORDER;

  const setContact = (key: keyof MasterProfile["contact"], value: string) =>
    onChange({ ...p, contact: { ...p.contact, [key]: value } });
  const setExp = (id: string, patch: Partial<MasterProfile["experiences"][number]>) =>
    onChange({ ...p, experiences: p.experiences.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const setProj = (id: string, patch: Partial<MasterProfile["projects"][number]>) =>
    onChange({ ...p, projects: p.projects.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setCSec = (id: string, patch: Partial<MasterProfile["custom_sections"][number]>) =>
    onChange({ ...p, custom_sections: p.custom_sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setCItem = (
    secId: string,
    itemId: string,
    patch: Partial<MasterProfile["custom_sections"][number]["items"][number]>
  ) =>
    setCSec(secId, {
      items: p.custom_sections.find((s) => s.id === secId)?.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) || [],
    });
  const setEdu = (id: string, patch: Partial<MasterProfile["education"][number]>) =>
    onChange({ ...p, education: p.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const moveSection = (idx: number, dir: -1 | 1) => {
    const arr = [...order];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange({ ...p, section_order: arr });
  };

  /* ---- Contact ---- */
  if (active === "contact") {
    return (
      <Panel title="Contact" subtitle="How recruiters reach you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={p.contact.name} onChange={(v) => setContact("name", v)} placeholder="Atharva Bari" />
          <Field label="Email" value={p.contact.email} onChange={(v) => setContact("email", v)} placeholder="you@email.com" />
          <Field label="Phone" value={p.contact.phone} onChange={(v) => setContact("phone", v)} placeholder="+91 00000 00000" />
          <Field label="Location" value={p.contact.location} onChange={(v) => setContact("location", v)} placeholder="City, Country" />
        </div>
        <div className="mt-4">
          <Label icon={<Link2 className="h-3.5 w-3.5" />}>Links</Label>
          <TagInput
            values={p.contact.links}
            onAdd={(v) => onChange({ ...p, contact: { ...p.contact, links: [...p.contact.links, v] } })}
            onRemove={(v) => onChange({ ...p, contact: { ...p.contact, links: p.contact.links.filter((x) => x !== v) } })}
            placeholder="linkedin.com/in/you · github.com/you  — press Enter"
          />
        </div>
      </Panel>
    );
  }

  /* ---- Summary ---- */
  if (active === "summary") {
    return (
      <Panel title="Professional Summary" subtitle="Two or three lines about who you are. Rewritten to match each job when tailoring.">
        <textarea
          value={p.summary}
          onChange={(e) => onChange({ ...p, summary: e.target.value })}
          placeholder="Detail-oriented engineer with hands-on experience building…"
          className="field min-h-[200px] w-full resize-y rounded-xl p-4 text-[15px] leading-relaxed"
        />
      </Panel>
    );
  }

  /* ---- Work Experience ---- */
  if (active === "experiences") {
    return (
      <Panel
        title="Work Experience"
        subtitle="Paid roles and internships."
        action={<AddBtn onClick={() => onChange({ ...p, experiences: [...p.experiences, newExperience()] })}>Add role</AddBtn>}
      >
        {p.experiences.length === 0 && <Empty>No roles yet — add your work experience, or fetch it from a resume.</Empty>}
        <div className="space-y-5">
          {p.experiences.map((exp) => (
            <EntryCard key={exp.id} onRemove={() => onChange({ ...p, experiences: p.experiences.filter((e) => e.id !== exp.id) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Role title" value={exp.role_title} onChange={(v) => setExp(exp.id, { role_title: v })} placeholder="Senior Software Engineer" />
                <Field label="Company" value={exp.company} onChange={(v) => setExp(exp.id, { company: v })} placeholder="Company" />
                <Field label="Dates" value={exp.date_range} onChange={(v) => setExp(exp.id, { date_range: v })} placeholder="2021 – Present" />
              </div>
              <BulletEditor bullets={exp.bullets} onChange={(bullets) => setExp(exp.id, { bullets })} />
            </EntryCard>
          ))}
        </div>
      </Panel>
    );
  }

  /* ---- Projects ---- */
  if (active === "projects") {
    return (
      <Panel
        title="Projects"
        subtitle="Personal, academic, or open-source work."
        action={<AddBtn onClick={() => onChange({ ...p, projects: [...p.projects, newProject()] })}>Add project</AddBtn>}
      >
        {p.projects.length === 0 && <Empty>No projects yet.</Empty>}
        <div className="space-y-5">
          {p.projects.map((proj) => (
            <EntryCard key={proj.id} onRemove={() => onChange({ ...p, projects: p.projects.filter((x) => x.id !== proj.id) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Project name" value={proj.name} onChange={(v) => setProj(proj.id, { name: v })} placeholder="Ordinal Flow" />
                <Field label="Role (optional)" value={proj.role_title} onChange={(v) => setProj(proj.id, { role_title: v })} placeholder="Creator" />
                <Field label="Dates (optional)" value={proj.date_range} onChange={(v) => setProj(proj.id, { date_range: v })} placeholder="2024" />
              </div>
              <BulletEditor bullets={proj.bullets} onChange={(bullets) => setProj(proj.id, { bullets })} placeholder="Describe what you built and its impact…" />
            </EntryCard>
          ))}
        </div>
      </Panel>
    );
  }

  /* ---- Custom Sections ---- */
  if (active === "custom") {
    return (
      <Panel
        title="Custom Sections"
        subtitle="Certifications, awards, achievements, competencies — anything else."
        action={
          <AddBtn
            onClick={() => {
              const sec = newCustomSection();
              onChange({
                ...p,
                custom_sections: [...p.custom_sections, sec],
                section_order: [...order, `custom:${sec.section_title}`],
              });
            }}
          >
            Add section
          </AddBtn>
        }
      >
        {p.custom_sections.length === 0 && <Empty>No custom sections yet.</Empty>}
        <div className="space-y-6">
          {p.custom_sections.map((sec) => (
            <div key={sec.id} className="rounded-2xl border border-[var(--border)] bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={sec.section_title}
                  onChange={(e) => {
                    const v = e.target.value;
                    const oldKey = `custom:${sec.section_title}`;
                    const newKey = `custom:${v}`;
                    const newOrder = order.map((x) => (x === oldKey ? newKey : x));
                    onChange({
                      ...p,
                      custom_sections: p.custom_sections.map((s) => (s.id === sec.id ? { ...s, section_title: v } : s)),
                      section_order: newOrder,
                    });
                  }}
                  placeholder="Section title (e.g. Certifications)"
                  className="field flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                />
                <IconBtn
                  title="Remove section"
                  onClick={() =>
                    onChange({
                      ...p,
                      custom_sections: p.custom_sections.filter((x) => x.id !== sec.id),
                      section_order: order.filter((x) => x !== `custom:${sec.section_title}`),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>
              <div className="space-y-4">
                {sec.items.map((item) => (
                  <EntryCard key={item.id} onRemove={() => setCSec(sec.id, { items: sec.items.filter((x) => x.id !== item.id) })}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name / title" value={item.name} onChange={(v) => setCItem(sec.id, item.id, { name: v })} placeholder="Prompt Engineering Workshop" />
                      <Field label="Subtitle (optional)" value={item.role_title} onChange={(v) => setCItem(sec.id, item.id, { role_title: v })} placeholder="IIT Bombay" />
                      <Field label="Date (optional)" value={item.date_range} onChange={(v) => setCItem(sec.id, item.id, { date_range: v })} placeholder="2024" />
                    </div>
                    <BulletEditor bullets={item.bullets} onChange={(bullets) => setCItem(sec.id, item.id, { bullets })} placeholder="Detail (optional)…" />
                  </EntryCard>
                ))}
                <button
                  onClick={() => setCSec(sec.id, { items: [...sec.items, newCustomItem()] })}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)] py-2 text-xs font-medium text-slate-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  /* ---- Education ---- */
  if (active === "education") {
    return (
      <Panel
        title="Education"
        subtitle="Degrees and schools."
        action={<AddBtn onClick={() => onChange({ ...p, education: [...p.education, newEducation()] })}>Add education</AddBtn>}
      >
        {p.education.length === 0 && <Empty>No education entries yet.</Empty>}
        <div className="space-y-4">
          {p.education.map((ed) => (
            <EntryCard key={ed.id} onRemove={() => onChange({ ...p, education: p.education.filter((x) => x.id !== ed.id) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Institution" value={ed.institution} onChange={(v) => setEdu(ed.id, { institution: v })} placeholder="Viva Institute of Technology" />
                <Field label="Degree" value={ed.degree} onChange={(v) => setEdu(ed.id, { degree: v })} placeholder="Diploma in Computer Engineering" />
                <Field label="Dates" value={ed.date_range} onChange={(v) => setEdu(ed.id, { date_range: v })} placeholder="2024 – 2027" />
              </div>
            </EntryCard>
          ))}
        </div>
      </Panel>
    );
  }

  /* ---- Skills ---- */
  if (active === "skills") {
    return (
      <Panel title="Skills" subtitle="Type a skill and press Enter. The most relevant ones are curated per job.">
        <TagInput
          values={p.skills}
          onAdd={(v) => !p.skills.includes(v) && onChange({ ...p, skills: [...p.skills, v] })}
          onRemove={(v) => onChange({ ...p, skills: p.skills.filter((x) => x !== v) })}
          placeholder="e.g. Python, React, SQL…"
          big
        />
      </Panel>
    );
  }

  /* ---- Section Order ---- */
  return (
    <Panel title="Section Order" subtitle="Set the order sections appear on your resume.">
      <div className="space-y-2">
        {order.map((key, i) => (
          <div key={key} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium capitalize text-slate-700">{key.replace("custom:", "")}</span>
            <div className="flex items-center gap-1">
              <button disabled={i === 0} onClick={() => moveSection(i, -1)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-25">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button disabled={i === order.length - 1} onClick={() => moveSection(i, 1)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-25">
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable primitives                                               */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
      {icon}
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field w-full rounded-xl px-4 py-3 text-[15px] text-slate-900"
      />
    </label>
  );
}

function BulletEditor({
  bullets,
  onChange,
  placeholder = "Describe an accomplishment (use real numbers if you have them)…",
}: {
  bullets: { id: string; text: string }[];
  onChange: (b: { id: string; text: string }[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      <Label>Bullets</Label>
      {bullets.map((b) => (
        <div key={b.id} className="flex items-start gap-2">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <textarea
            value={b.text}
            onChange={(e) => onChange(bullets.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))}
            placeholder={placeholder}
            rows={2}
            className="field min-h-[52px] w-full resize-y rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-slate-900"
          />
          <IconBtn title="Remove bullet" onClick={() => onChange(bullets.filter((x) => x.id !== b.id))}>
            <XCircle className="h-4 w-4" />
          </IconBtn>
        </div>
      ))}
      <button
        onClick={() => onChange([...bullets, newBullet()])}
        className="ml-3.5 flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-[var(--accent)]"
      >
        <Plus className="h-3.5 w-3.5" /> Add bullet
      </button>
    </div>
  );
}

function TagInput({
  values,
  onAdd,
  onRemove,
  placeholder,
  big,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
  big?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
  };
  return (
    <div className={`field flex flex-wrap gap-2 rounded-xl px-3 ${big ? "min-h-[120px] items-start py-3" : "items-center py-2.5"}`}>
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-800">
          {v}
          <button onClick={() => onRemove(v)} className="text-slate-400 hover:text-rose-500">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="min-w-[12rem] flex-1 bg-transparent py-1 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
      />
    </div>
  );
}

function EntryCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-slate-50 p-4 pr-12">
      <button
        onClick={onRemove}
        title="Remove"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="btn-ghost flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-sm text-slate-500">{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Fetch-from-resume modal                                           */
/* ------------------------------------------------------------------ */

function FetchModal({ onClose, onParsed }: { onClose: () => void; onParsed: (p: MasterProfile) => void }) {
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(input: File | string) {
    setParsing(true);
    setError(null);
    try {
      let res: Response;
      if (typeof input === "string") {
        res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: input }),
        });
      } else {
        const form = new FormData();
        form.append("file", input);
        res = await fetch("/api/parse", { method: "POST", body: form });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the resume.");
      onParsed(data.profile as MasterProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse resume.");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 w-full max-w-lg rounded-2xl p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Fetch from existing resume</h3>
            <p className="text-sm text-slate-500">Upload a PDF or paste text — we extract and merge it into your profile.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <ModeToggle active={mode === "pdf"} onClick={() => setMode("pdf")} icon={<UploadCloud className="h-4 w-4" />}>
            Upload PDF
          </ModeToggle>
          <ModeToggle active={mode === "text"} onClick={() => setMode("text")} icon={<ClipboardPaste className="h-4 w-4" />}>
            Paste text
          </ModeToggle>
        </div>

        {mode === "pdf" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) run(f);
            }}
            onClick={() => !parsing && fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-strong)] hover:border-slate-400"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
            </div>
            <div className="text-sm">
              <span className="font-semibold text-slate-900">Drop your resume PDF</span>
              <span className="text-slate-500"> or click to browse</span>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your full resume text here…"
              className="field min-h-[180px] w-full resize-y rounded-xl p-4 font-mono text-xs leading-relaxed text-slate-900"
            />
            <button
              onClick={() => run(text)}
              disabled={parsing || text.trim().length < 20}
              className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Extract &amp; merge
            </button>
          </div>
        )}

        {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      </div>
    </div>
  );
}

function ModeToggle({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-slate-600 hover:text-slate-900"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
