"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  FileText,
  UploadCloud,
  Target,
  Sparkles,
  Wand2,
  Loader2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import GeneratingOverlay from "@/components/GeneratingOverlay";
import { ensureUniqueIds, profileHasContent } from "@/lib/profile";
import type { MasterProfile } from "@/lib/schema";

type Source = "profile" | "upload";
type Mode = "jd" | "grammar";

/** A short, human title for the saved resume. */
function makeTitle(source: Source, mode: Mode, jd: string, fileName?: string): string {
  if (mode === "jd" && jd.trim()) {
    const firstLine = jd.split(/\n/).map((s) => s.trim()).find(Boolean) || "";
    return firstLine.slice(0, 48) || "Tailored resume";
  }
  if (source === "upload") return (fileName || "").replace(/\.pdf$/i, "").slice(0, 48) || "Uploaded resume";
  return "Resume from profile";
}

async function createResumeRow(body: { title: string; kind: "template" | "upload"; payload: unknown }): Promise<string> {
  const res = await fetch("/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not save the resume.");
  return data.id as string;
}

function TailorInner() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();

  const [source, setSource] = useState<Source>(params.get("source") === "upload" ? "upload" : "profile");
  const [mode, setMode] = useState<Mode>("jd");
  const [jd, setJd] = useState("");

  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const { data } = await res.json();
          if (data?.profile) {
            setProfile(ensureUniqueIds(data.profile));
            setHasProfile(profileHasContent(data.profile));
            return;
          }
        }
        setHasProfile(false);
      } catch {
        setHasProfile(false);
      }
    })();
  }, [status]);

  const readAsDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  async function generate() {
    setError(null);
    const useJd = mode === "jd";
    if (useJd && jd.trim().length < 20) {
      setError("Paste a job description (at least a couple of lines) to tailor against.");
      return;
    }

    setBusy(true);
    try {
      if (source === "profile") {
        if (!profile || !profileHasContent(profile)) {
          setError("Your profile is empty. Set it up first.");
          setBusy(false);
          return;
        }
        setBusyMsg("Tailoring your resume…");
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, jd: useJd ? jd : "", template: "modern" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate.");
        const id = await createResumeRow({
          title: makeTitle("profile", mode, jd),
          kind: "template",
          payload: { result: data.result, proof: data.proof, profile, jd: useJd ? jd : "", template: "modern" },
        });
        router.push(`/results?id=${id}`);
        return;
      }

      // upload
      if (!file) {
        setError("Choose a PDF resume to upload.");
        setBusy(false);
        return;
      }
      setBusyMsg("Reading your resume…");
      const form = new FormData();
      form.append("file", file);
      const layoutRes = await fetch("/api/parse-layout", { method: "POST", body: form });
      const layout = await layoutRes.json();
      if (!layoutRes.ok) throw new Error(layout.error || "Could not read the PDF.");

      setBusyMsg(useJd ? "Tailoring the wording…" : "Polishing the grammar…");
      const tailorRes = await fetch("/api/tailor-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: layout.blocks, jd: useJd ? jd : "", mode }),
      });
      const tailored = await tailorRes.json();
      if (!tailorRes.ok) throw new Error(tailored.error || "Failed to tailor the resume.");

      setBusyMsg("Preparing your result…");
      const originalPdfDataUrl = await readAsDataUrl(file);
      const id = await createResumeRow({
        title: makeTitle("upload", mode, jd, file.name),
        kind: "upload",
        payload: {
          pages: layout.pages,
          blocks: tailored.blocks,
          originalPdfDataUrl,
          jd: useJd ? jd : "",
          mode,
          engine: tailored.engine,
          warning: tailored.warning,
        },
      });
      router.push(`/results?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tailor a resume</h1>
        <p className="mt-1.5 text-sm text-slate-500">Pick a source, choose whether to tailor to a job or just fix grammar, then generate.</p>

        {/* Source selector */}
        <div className="mt-7">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Source</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SourceTile
              active={source === "profile"}
              onClick={() => setSource("profile")}
              icon={<FileText className="h-5 w-5" />}
              title="From my profile"
              desc="Build from your saved details."
            />
            <SourceTile
              active={source === "upload"}
              onClick={() => setSource("upload")}
              icon={<UploadCloud className="h-5 w-5" />}
              title="Upload existing resume"
              desc="Keep your PDF's exact look."
            />
          </div>
        </div>

        {/* Source-specific input */}
        <div className="mt-6">
          {source === "profile" ? (
            hasProfile === false ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  Your profile is empty. Add your details first so we can build a resume from them.
                </div>
                <Link href="/profile" className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm">
                  Set up profile
                </Link>
              </div>
            ) : (
              <div className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm text-slate-600">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Using your saved profile{profile?.contact.name ? ` — ${profile.contact.name}` : ""}.
                <Link href="/profile" className="ml-auto font-medium text-[var(--accent)] hover:underline">
                  Edit
                </Link>
              </div>
            )
          ) : (
            <UploadDrop
              file={file}
              dragOver={dragOver}
              onPick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              inputRef={fileRef}
              onChange={(f) => setFile(f)}
            />
          )}
        </div>

        {/* Mode selector */}
        <div className="mt-7">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">What to do</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeTile
              active={mode === "jd"}
              onClick={() => setMode("jd")}
              icon={<Target className="h-5 w-5" />}
              title="Tailor to a job description"
              desc="Align the wording to a specific role."
            />
            <ModeTile
              active={mode === "grammar"}
              onClick={() => setMode("grammar")}
              icon={<Sparkles className="h-5 w-5" />}
              title="Just improve grammar"
              desc="Polish clarity and phrasing only."
            />
          </div>
        </div>

        {/* JD input */}
        <AnimatePresence initial={false}>
          {mode === "jd" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-6">
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Job description</div>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the target job description here…"
                  className="field h-52 w-full resize-y rounded-xl p-4 text-sm leading-relaxed"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <XCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy}
          className="btn-primary mt-7 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy ? busyMsg || "Generating…" : "Generate resume"}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </main>

      <AnimatePresence>{busy && <GeneratingOverlay msg={busyMsg} />}</AnimatePresence>
    </div>
  );
}

function SourceTile({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/30" : "border-[var(--border)] bg-white hover:border-slate-300"
      }`}
    >
      <span className={active ? "text-[var(--accent)]" : "text-slate-400"}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

const ModeTile = SourceTile;

function UploadDrop({
  file,
  dragOver,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onChange,
}: {
  file: File | null;
  dragOver: boolean;
  onPick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (f: File) => void;
}) {
  return (
    <div
      onClick={onPick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-strong)] hover:border-slate-400"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        {file ? <CheckCircle2 className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
      </div>
      <div className="text-sm">
        {file ? (
          <span className="font-semibold text-slate-900">{file.name}</span>
        ) : (
          <>
            <span className="font-semibold text-slate-900">Drop your resume PDF</span>
            <span className="text-slate-500"> or click to browse</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
      />
    </div>
  );
}

export default function TailorPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
        </main>
      }
    >
      <TailorInner />
    </Suspense>
  );
}
