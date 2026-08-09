"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Pencil,
  Check,
  Loader2,
  FileWarning,
  Copy,
  CheckCircle2,
  LayoutTemplate,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  X,
  Wand2,
  TrendingUp,
  Cloud,
  Mail,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import EditableResume, { type ResumeWork } from "@/components/EditableResume";
import UploadedResume from "@/components/UploadedResume";
import JdMatch from "@/components/JdMatch";
import AtsReport from "@/components/AtsReport";
import JobPanel from "@/components/JobPanel";
import CoverLetterPanel from "@/components/CoverLetterPanel";
import DownloadMenu from "@/components/DownloadMenu";
import { ResumeDoc, TEMPLATES, type TemplateId } from "@/components/ResumeDoc";
import { toMarkdown } from "@/lib/export";
import { computeJdMatch, templateResumeText, uploadResumeText, type JdMatch as JdMatchData } from "@/lib/jd-match";
import { atsFromTemplate, atsFromUpload } from "@/lib/ats-report";
import type { JobMeta } from "@/lib/job";
import type { MasterProfile, AlignmentResult } from "@/lib/schema";
import type { LayoutBlock } from "@/lib/pdf-layout";

interface TemplatePayload {
  result: AlignmentResult;
  profile: MasterProfile;
  jd: string;
  template: TemplateId;
  fabricated?: boolean;
  [k: string]: unknown;
}
interface UploadPayload {
  pages: { width: number; height: number }[];
  blocks: LayoutBlock[];
  originalPdfDataUrl: string;
  jd: string;
  mode: "jd" | "grammar";
  engine: string;
  warning: string | null;
  [k: string]: unknown;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function ResultsInner() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const idParam = params.get("id");
  const applyTemplateParam = params.get("apply_template");

  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"template" | "upload" | null>(null);
  const [work, setWork] = useState<ResumeWork | null>(null);
  const [upload, setUpload] = useState<UploadPayload | null>(null);
  const [jd, setJd] = useState("");
  const [fabricated, setFabricated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [job, setJob] = useState<JobMeta>({});

  // Cover letter + Word export
  const [coverLetter, setCoverLetter] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [downloadingWord, setDownloadingWord] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const payloadRef = useRef<Record<string, unknown>>({});
  const dirtyRef = useRef(false);

  // Boost (fabricate) flow
  const [warnOpen, setWarnOpen] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState<string | null>(null);
  const [preBoost, setPreBoost] = useState<JdMatchData | null>(null);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const hydrate = useCallback((row: { id: string; title: string; kind: string; payload: any; job?: JobMeta }) => {
    payloadRef.current = row.payload || {};
    setResumeId(row.id);
    setTitle(row.title || "Untitled resume");
    setJob(row.job || {});
    setCoverLetter((row.payload && row.payload.coverLetter) || "");
    if (row.kind === "template") {
      const p = row.payload as TemplatePayload;
      setKind("template");
      setWork({ profile: p.profile, result: p.result, template: (p.template as TemplateId) || "modern", headings: {} });
      setUpload(null);
      setJd(p.jd || "");
      setFabricated(!!p.fabricated);
    } else {
      const p = row.payload as UploadPayload;
      setKind("upload");
      setUpload(p);
      setWork(null);
      setJd(p.jd || "");
      setFabricated(false);
    }
    dirtyRef.current = false;
  }, []);

  const loadById = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/resumes/${id}`);
      if (!res.ok) return false;
      const { data } = await res.json();
      if (!data) return false;
      hydrate(data);
      return true;
    },
    [hydrate]
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Load the requested resume (or the most recent one if no id in the URL).
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (idParam) {
          await loadById(idParam);
        } else {
          const listRes = await fetch("/api/resumes");
          if (listRes.ok) {
            const { data } = await listRes.json();
            if (Array.isArray(data) && data.length > 0) {
              router.replace(`/results?id=${data[0].id}`);
              return;
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, idParam, loadById, router]);

  // Apply template from gallery
  useEffect(() => {
    if (kind === "template" && work && applyTemplateParam) {
      if (work.template !== applyTemplateParam && TEMPLATES.some(t => t.id === applyTemplateParam)) {
        updateWork(w => ({ ...w, template: applyTemplateParam as TemplateId }));
        const url = new URL(window.location.href);
        url.searchParams.delete("apply_template");
        router.replace(url.pathname + url.search);
      }
    }
  }, [kind, work?.template, applyTemplateParam, router]);

  // Rebuild the payload from current state, preserving untouched fields.
  const buildPayload = useCallback((): unknown => {
    if (kind === "template" && work) {
      return { ...payloadRef.current, result: work.result, profile: work.profile, template: work.template, coverLetter };
    }
    if (kind === "upload" && upload) {
      return { ...payloadRef.current, ...upload, coverLetter };
    }
    return null;
  }, [kind, work, upload, coverLetter]);

  // Autosave edits (debounced) — only when something actually changed.
  useEffect(() => {
    if (!resumeId || !dirtyRef.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const payload = buildPayload();
        const res = await fetch(`/api/resumes/${resumeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, payload, job }),
        });
        dirtyRef.current = false;
        setSaveState(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [work, upload, title, coverLetter, job, resumeId, buildPayload]);

  const updateWork = (updater: (w: ResumeWork) => ResumeWork) => {
    markDirty();
    setWork((w) => (w ? updater(w) : w));
  };
  const updateUpload = (id: string, text: string) => {
    markDirty();
    setUpload((u) => (u ? { ...u, blocks: u.blocks.map((b) => (b.id === id ? { ...b, text } : b)) } : u));
  };
  const changeTitle = (v: string) => {
    markDirty();
    setTitle(v);
  };
  const changeJob = (patch: Partial<JobMeta>) => {
    markDirty();
    setJob((j) => ({ ...j, ...patch }));
  };
  const changeCover = (v: string) => {
    markDirty();
    setCoverLetter(v);
  };

  async function generateCover() {
    setCoverError(null);
    setCoverGenerating(true);
    try {
      const identity = deriveIdentity(kind, work, upload);
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd, name: identity.name, baseText: identity.baseText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to write the cover letter.");
      changeCover(data.letter);
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setCoverGenerating(false);
    }
  }

  async function downloadPdf(mode: "styled" | "ats") {
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, mode, title, payload: buildPayload() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "PDF export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (title || "resume").replace(/[^\w.-]+/g, "_");
      a.href = url;
      a.download = mode === "ats" ? `${safe}_ATS.pdf` : `${safe}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function downloadWord(docType: "resume" | "cover") {
    setDownloadingWord(true);
    try {
      const identity = deriveIdentity(kind, work, upload);
      const res = await fetch("/api/export/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docType,
          kind,
          title,
          name: identity.name,
          payload: buildPayload(),
          coverLetter,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Word export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (title || "resume").replace(/[^\w.-]+/g, "_");
      a.href = url;
      a.download = docType === "cover" ? `${safe}_CoverLetter.docx` : `${safe}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Word export failed.");
    } finally {
      setDownloadingWord(false);
    }
  }

  // Live JD match against whatever resume is shown.
  const match = useMemo<JdMatchData | null>(() => {
    if (!jd.trim()) return null;
    if (kind === "template" && work) return computeJdMatch(jd, templateResumeText(work.profile, work.result));
    if (kind === "upload" && upload) return computeJdMatch(jd, uploadResumeText(upload.blocks));
    return null;
  }, [jd, kind, work, upload]);

  // Deterministic ATS quality report.
  const ats = useMemo(() => {
    if (kind === "template" && work) return atsFromTemplate(work.profile, work.result);
    if (kind === "upload" && upload) return atsFromUpload(upload.blocks);
    return null;
  }, [kind, work, upload]);

  async function runBoost() {
    setBoostError(null);
    setBoosting(true);
    setWarnOpen(false);
    setPreBoost(match);
    try {
      const identity = deriveIdentity(kind, work, upload);
      const res = await fetch("/api/tailor-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd, title: `${title} (JD-matched)`, ...identity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate a matched draft.");
      setEditMode(false);
      router.push(`/results?id=${data.id}`);
    } catch (e) {
      setBoostError(e instanceof Error ? e.message : "Something went wrong.");
      setPreBoost(null);
    } finally {
      setBoosting(false);
    }
  }

  if (status !== "authenticated" || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    );
  }

  if (!kind) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
          <FileWarning className="h-10 w-10 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">No resume yet</h1>
          <p className="mt-1.5 text-sm text-slate-500">Generate a resume from the dashboard to see it here.</p>
          <Link href="/dashboard" className="btn-primary mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold">
            Go to dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="print-root mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Title + save state */}
        <div className="no-print mb-4 flex items-center gap-3">
          <Link href="/resumes" className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> My Resumes
          </Link>
          <input
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-bold text-slate-900 outline-none transition hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-white"
            placeholder="Untitled resume"
          />
          <SaveIndicator state={saveState} />
        </div>

        {/* Fabricated warning + before/after summary */}
        {fabricated && <FabricatedBanner before={preBoost} after={match} />}
        {boostError && (
          <div className="no-print mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <X className="h-4 w-4 shrink-0" /> {boostError}
          </div>
        )}

        {/* Job details */}
        <div className="no-print mb-4">
          <JobPanel job={job} onChange={changeJob} />
        </div>

        {/* JD match */}
        {match && (
          <div className="no-print mb-4">
            <JdMatch match={match} fabricated={fabricated} boosting={boosting} onBoost={() => setWarnOpen(true)} />
          </div>
        )}

        {/* ATS report */}
        {ats && (
          <div className="no-print mb-5">
            <AtsReport report={ats} missing={match?.missing ?? []} />
          </div>
        )}

        {kind === "template" && work ? (
          <TemplateResult
            work={work}
            updateWork={updateWork}
            editMode={editMode}
            setEditMode={setEditMode}
            onCover={() => setCoverOpen(true)}
            onStyledPdf={() => downloadPdf("styled")}
            onAtsPdf={() => downloadPdf("ats")}
            onWord={() => downloadWord("resume")}
            downloading={downloadingPdf || downloadingWord}
            resumeId={resumeId}
          />
        ) : upload ? (
          <UploadResult
            upload={upload}
            onEdit={updateUpload}
            editMode={editMode}
            setEditMode={setEditMode}
            onCover={() => setCoverOpen(true)}
            onStyledPdf={() => downloadPdf("styled")}
            onAtsPdf={() => downloadPdf("ats")}
            onWord={() => downloadWord("resume")}
            downloading={downloadingPdf || downloadingWord}
          />
        ) : null}
      </main>

      {warnOpen && <BoostWarning onCancel={() => setWarnOpen(false)} onConfirm={runBoost} pct={match?.pct ?? 0} />}
      {coverOpen && (
        <CoverLetterPanel
          letter={coverLetter}
          onChange={changeCover}
          onGenerate={generateCover}
          generating={coverGenerating}
          error={coverError}
          hasJd={jd.trim().length >= 20}
          onWord={() => downloadWord("cover")}
          downloadingWord={downloadingWord}
          onClose={() => setCoverOpen(false)}
        />
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
        </main>
      }
    >
      <ResultsInner />
    </Suspense>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { text: "Saving…", cls: "text-slate-500", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    saved: { text: "Saved", cls: "text-emerald-600", icon: <Cloud className="h-3.5 w-3.5" /> },
    error: { text: "Save failed", cls: "text-rose-600", icon: <X className="h-3.5 w-3.5" /> },
  } as const;
  const s = map[state];
  return <span className={`no-print flex shrink-0 items-center gap-1.5 text-xs font-medium ${s.cls}`}>{s.icon}{s.text}</span>;
}

/* ------------------------------------------------------------------ */
/*  Identity extraction for the boost flow                            */
/* ------------------------------------------------------------------ */

function deriveIdentity(
  kind: "template" | "upload" | null,
  work: ResumeWork | null,
  upload: UploadPayload | null
) {
  if (kind === "template" && work) {
    const c = work.profile.contact;
    return {
      name: c.name,
      email: c.email,
      phone: c.phone,
      location: c.location,
      links: c.links,
      education: work.profile.education,
      baseText: templateResumeText(work.profile, work.result),
    };
  }
  if (kind === "upload" && upload) {
    const nameBlock = upload.blocks.find((b) => b.kind === "name");
    const contactBlock = upload.blocks.find((b) => b.kind === "contact");
    const ctext = contactBlock?.text || "";
    const email = ctext.match(/\S+@\S+\.\S+/)?.[0] || "";
    const phone = ctext.match(/\+?\d[\d ()\-]{7,}\d/)?.[0] || "";
    const links = ctext.match(/\b(?:https?:\/\/)?[\w.-]+\.(?:com|io|dev|org|net)\/\S+/gi) || [];
    return {
      name: nameBlock?.text || "",
      email,
      phone,
      location: "",
      links,
      education: [],
      baseText: uploadResumeText(upload.blocks),
    };
  }
  return { name: "", email: "", phone: "", location: "", links: [], education: [], baseText: "" };
}

/* ------------------------------------------------------------------ */
/*  Fabricated banner + summary                                       */
/* ------------------------------------------------------------------ */

function FabricatedBanner({ before, after }: { before: JdMatchData | null; after: JdMatchData | null }) {
  const added = before && after ? after.matched.filter((m) => !before.matched.includes(m)) : after?.matched ?? [];
  return (
    <div className="no-print mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-900">This is a JD-matched draft with fabricated details</div>
          <p className="mt-0.5 text-sm text-amber-800">
            Experience, employers, and metrics below were invented to match the job description. Replace them with your
            real details before using this resume — submitting fabricated experience can constitute misrepresentation.
          </p>
          {(before || after) && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              {before && after && (
                <span className="flex items-center gap-1.5 font-semibold text-amber-900">
                  <TrendingUp className="h-4 w-4" /> Match {before.pct}% → {after.pct}%
                </span>
              )}
              {!before && after && <span className="font-semibold text-amber-900">Match {after.pct}%</span>}
              {added.length > 0 && (
                <span className="text-amber-800">
                  Now covering: <span className="font-medium">{added.slice(0, 10).join(", ")}</span>
                  {added.length > 10 ? ` +${added.length - 10} more` : ""}
                </span>
              )}
              {after && after.missing.length > 0 && (
                <span className="text-amber-800">
                  Still missing: <span className="font-medium">{after.missing.slice(0, 8).join(", ")}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Boost warning modal                                               */
/* ------------------------------------------------------------------ */

function BoostWarning({ onCancel, onConfirm, pct }: { onCancel: () => void; onConfirm: () => void; pct: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Generate a fabricated draft?</h3>
            <p className="mt-1 text-sm text-slate-600">
              Your resume currently matches <span className="font-semibold">{pct}%</span> of this job. This will build a
              brand-new resume that <span className="font-semibold text-slate-900">invents skills, employers, and
              achievements</span> to match the job description.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
              <li className="flex gap-2"><span className="text-amber-500">•</span> The invented details are not true and are for drafting only.</li>
              <li className="flex gap-2"><span className="text-amber-500">•</span> You must replace them with your real experience before using it.</li>
              <li className="flex gap-2"><span className="text-amber-500">•</span> Your name, contact, and education are kept as-is.</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost rounded-lg px-4 py-2 text-sm font-medium">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4" /> I understand — generate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar shared bits                                               */
/* ------------------------------------------------------------------ */

function Toolbar({
  editMode,
  onToggleEdit,
  onCover,
  onStyledPdf,
  onAtsPdf,
  onWord,
  onPrint,
  downloading,
  extra,
}: {
  editMode: boolean;
  onToggleEdit: () => void;
  onCover: () => void;
  onStyledPdf: () => void;
  onAtsPdf: () => void;
  onWord: () => void;
  onPrint: () => void;
  downloading: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      {extra}
      <div className="flex-1" />
      <button onClick={onCover} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
        <Mail className="h-4 w-4" /> Cover letter
      </button>
      <button
        onClick={onToggleEdit}
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
          editMode ? "bg-emerald-600 text-white hover:bg-emerald-700" : "btn-ghost"
        }`}
      >
        {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {editMode ? "Done editing" : "Edit"}
      </button>
      <DownloadMenu onStyledPdf={onStyledPdf} onAtsPdf={onAtsPdf} onWord={onWord} onPrint={onPrint} busy={downloading} />
    </div>
  );
}

function EditHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="no-print mb-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2 text-xs text-slate-600">
      Click any text on the resume to edit it. Edits autosave and are captured in the PDF download.
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Template result                                                   */
/* ------------------------------------------------------------------ */

function TemplateResult({
  work,
  updateWork,
  editMode,
  setEditMode,
  onCover,
  onStyledPdf,
  onAtsPdf,
  onWord,
  downloading,
  resumeId,
}: {
  work: ResumeWork;
  updateWork: (updater: (w: ResumeWork) => ResumeWork) => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  onCover: () => void;
  onStyledPdf: () => void;
  onAtsPdf: () => void;
  onWord: () => void;
  downloading: boolean;
  resumeId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => toMarkdown(work.profile, work.result), [work.profile, work.result]);

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const printResume = () => {
    const originalTitle = document.title;
    const userName = (work.profile.contact.name || "User").replace(/\s+/g, "");
    const theme = work.template.charAt(0).toUpperCase() + work.template.slice(1);
    const id = new URLSearchParams(window.location.search).get("id") || "unknown";
    document.title = `${userName}-${theme}-${id}`;
    window.print();
    document.title = originalTitle;
  };

  return (
    <div>
      <Toolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        onCover={onCover}
        onStyledPdf={onStyledPdf}
        onAtsPdf={onAtsPdf}
        onWord={onWord}
        onPrint={printResume}
        downloading={downloading}
        extra={
          <>
            <div className="hidden items-center gap-1 sm:flex">
              <Link href={`/templates?id=${resumeId || ""}`} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
                <LayoutTemplate className="h-4 w-4" /> Change Template
              </Link>
            </div>
            <button onClick={copyMd} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Markdown"}
            </button>
          </>
        }
      />
      <EditHint show={editMode} />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <ProfileSidePanel profile={work.profile} />
        <div className="resume-shell glass overflow-auto rounded-2xl p-5 ring-1 ring-[var(--accent)]/15 sm:p-8">
          <EditableResume work={work} setWork={updateWork} editable={editMode} className="resume-sheet mx-auto max-w-[820px]" />
        </div>
      </div>
    </div>
  );
}

function ProfileSidePanel({ profile }: { profile: MasterProfile }) {
  return (
    <aside className="no-print space-y-4 lg:sticky lg:top-20 lg:self-start">
      <div className="glass-panel rounded-xl p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Your profile</div>
        <div className="mt-2 text-base font-bold text-slate-900">{profile.contact.name || "—"}</div>
        <div className="mt-0.5 space-y-0.5 text-xs text-slate-500">
          {[profile.contact.email, profile.contact.phone, profile.contact.location].filter(Boolean).map((x, i) => (
            <div key={i}>{x}</div>
          ))}
        </div>
      </div>
      {profile.experiences.length > 0 && (
        <SideList title="Experience" items={profile.experiences.map((e) => [e.role_title, e.company].filter(Boolean).join(" · "))} />
      )}
      {profile.projects.length > 0 && <SideList title="Projects" items={profile.projects.map((p) => p.name).filter(Boolean)} />}
      {profile.skills.length > 0 && (
        <div className="glass-panel rounded-xl p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Skills</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.slice(0, 24).map((s) => (
              <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="px-1 text-xs text-slate-400">
        Built from your profile.{" "}
        <Link href="/profile" className="text-[var(--accent)] hover:underline">
          Edit profile
        </Link>
      </p>
    </aside>
  );
}

function SideList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {items.map((it, i) => (
          <li key={i} className="truncate">
            {it || "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upload result — faithful reconstruction                          */
/* ------------------------------------------------------------------ */

function UploadResult({
  upload,
  onEdit,
  editMode,
  setEditMode,
  onCover,
  onStyledPdf,
  onAtsPdf,
  onWord,
  downloading,
}: {
  upload: UploadPayload;
  onEdit: (id: string, text: string) => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  onCover: () => void;
  onStyledPdf: () => void;
  onAtsPdf: () => void;
  onWord: () => void;
  downloading: boolean;
}) {
  const printResume = () => {
    const originalTitle = document.title;
    const nameBlock = upload.blocks.find((b) => b.kind === "name");
    const userName = (nameBlock?.text || "User").replace(/\s+/g, "");
    const id = new URLSearchParams(window.location.search).get("id") || "unknown";
    document.title = `${userName}-Upload-${id}`;
    window.print();
    document.title = originalTitle;
  };

  return (
    <div>
      <Toolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        onCover={onCover}
        onStyledPdf={onStyledPdf}
        onAtsPdf={onAtsPdf}
        onWord={onWord}
        onPrint={printResume}
        downloading={downloading}
      />
      {upload.warning && (
        <div className="no-print mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {upload.warning}
        </div>
      )}
      <EditHint show={editMode} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="no-print">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Your upload</div>
          <div className="glass overflow-hidden rounded-2xl">
            <object data={upload.originalPdfDataUrl} type="application/pdf" className="h-[80vh] w-full">
              <div className="p-6 text-center text-sm text-slate-500">Preview unavailable in this browser.</div>
            </object>
          </div>
        </div>
        <div>
          <div className="no-print mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
            <ShieldCheck className="h-4 w-4" /> Tailored — same look
          </div>
          <div className="resume-shell glass rounded-2xl p-4 ring-1 ring-[var(--accent)]/15">
            <UploadedResume pages={upload.pages} blocks={upload.blocks} editable={editMode} onEdit={onEdit} className="resume-sheet print-exact" />
          </div>
        </div>
      </div>
    </div>
  );
}
