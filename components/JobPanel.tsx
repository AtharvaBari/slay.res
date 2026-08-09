"use client";

import { useState } from "react";
import { Briefcase, ChevronDown, ExternalLink } from "lucide-react";
import { JOB_STATUSES, statusMeta, type JobMeta, type JobStatus } from "@/lib/job";

/** Editable job-application details attached to a resume (company, role, status,
 * link, notes). Autosaved by the Results page. */
export default function JobPanel({ job, onChange }: { job: JobMeta; onChange: (patch: Partial<JobMeta>) => void }) {
  const [open, setOpen] = useState(false);
  const sm = statusMeta(job.status);
  const summary = [job.company, job.role].filter(Boolean).join(" · ");

  const setStatus = (status: JobStatus) => {
    const patch: Partial<JobMeta> = { status };
    if (status === "applied" && !job.appliedAt) patch.appliedAt = Date.now();
    onChange(patch);
  };

  return (
    <div className="no-print glass rounded-2xl">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Briefcase className="h-5 w-5" />
        </div>
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Application</span>
          <span className="truncate text-sm text-slate-600">{summary || "Add job details"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
        <select
          value={job.status || "saved"}
          onChange={(e) => setStatus(e.target.value as JobStatus)}
          className={`rounded-lg border-0 px-2.5 py-1.5 text-xs font-semibold outline-none ring-1 ring-inset ring-transparent focus:ring-[var(--accent)] ${sm.badge}`}
        >
          {JOB_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Company</span>
              <input
                value={job.company || ""}
                onChange={(e) => onChange({ company: e.target.value })}
                placeholder="e.g. Acme Inc."
                className="field w-full rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Role</span>
              <input
                value={job.role || ""}
                onChange={(e) => onChange({ role: e.target.value })}
                placeholder="e.g. Senior Frontend Engineer"
                className="field w-full rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Job posting URL</span>
            <div className="flex items-center gap-2">
              <input
                value={job.url || ""}
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder="https://…"
                className="field w-full rounded-lg px-3 py-2 text-sm"
              />
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm"
                >
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
              )}
            </div>
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Notes</span>
            <textarea
              value={job.notes || ""}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Recruiter name, referral, follow-up dates…"
              className="field min-h-[70px] w-full resize-y rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  );
}
