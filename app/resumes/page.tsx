"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FileText, UploadCloud, Plus, Trash2, Loader2, Clock, FileStack, ExternalLink } from "lucide-react";
import Navbar from "@/components/Navbar";
import { JOB_STATUSES, statusMeta, type JobMeta, type JobStatus } from "@/lib/job";

interface ResumeMeta {
  id: string;
  title: string;
  kind: "template" | "upload";
  job: JobMeta;
  createdAt: number;
  updatedAt: number;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ResumesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ResumeMeta[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobStatus | "all">("all");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/resumes");
        if (res.ok) {
          const { data } = await res.json();
          setItems(data as ResumeMeta[]);
        } else setItems([]);
      } catch {
        setItems([]);
      }
    })();
  }, [status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length || 0 };
    for (const s of JOB_STATUSES) c[s.id] = 0;
    for (const it of items || []) c[it.job.status || "saved"] = (c[it.job.status || "saved"] || 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (items || []).filter((it) => filter === "all" || (it.job.status || "saved") === filter),
    [items, filter]
  );

  async function setStatus(id: string, job: JobMeta, next: JobStatus) {
    const merged: JobMeta = { ...job, status: next };
    if (next === "applied" && !merged.appliedAt) merged.appliedAt = Date.now();
    setItems((its) => (its ? its.map((r) => (r.id === id ? { ...r, job: merged } : r)) : its));
    try {
      await fetch(`/api/resumes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: merged }),
      });
    } catch {
      /* optimistic; ignore */
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      setItems((it) => (it ? it.filter((r) => r.id !== id) : it));
    } finally {
      setDeleting(null);
    }
  }

  if (status !== "authenticated" || items === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Resumes</h1>
            <p className="mt-1 text-sm text-slate-500">Track each resume through your application pipeline.</p>
          </div>
          <Link href="/dashboard" className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> New resume
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="glass flex flex-col items-center rounded-2xl px-6 py-16 text-center">
            <FileStack className="h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-bold text-slate-900">No resumes yet</h2>
            <p className="mt-1 text-sm text-slate-500">Generate your first tailored resume from the dashboard.</p>
            <Link href="/dashboard" className="btn-primary mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold">
              Go to dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Status filters */}
            <div className="mb-5 flex flex-wrap gap-2">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
              {JOB_STATUSES.map((s) => (
                <FilterChip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} label={s.label} count={counts[s.id]} dot={s.dot} />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((r) => (
                <div key={r.id} className="glass flex items-start gap-3 rounded-2xl p-4 transition hover:border-[var(--accent)]/40">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      r.kind === "upload" ? "bg-sky-50 text-sky-600" : "bg-[var(--accent-soft)] text-[var(--accent)]"
                    }`}
                  >
                    {r.kind === "upload" ? <UploadCloud className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/results?id=${r.id}`} className="block">
                      <div className="truncate font-semibold text-slate-900">{r.title}</div>
                      {(r.job.company || r.job.role) && (
                        <div className="truncate text-xs text-slate-500">{[r.job.company, r.job.role].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" /> {timeAgo(r.updatedAt)}
                      </div>
                    </Link>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={r.job.status || "saved"}
                        onChange={(e) => setStatus(r.id, r.job, e.target.value as JobStatus)}
                        className={`rounded-md px-2 py-1 text-xs font-semibold outline-none ${statusMeta(r.job.status).badge}`}
                      >
                        {JOB_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {r.job.url && (
                        <a href={r.job.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[var(--accent)]" title="Open job posting">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(r.id)}
                    disabled={deleting === r.id}
                    title="Delete"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                  >
                    {deleting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? "bg-[var(--accent)]/15" : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );
}
