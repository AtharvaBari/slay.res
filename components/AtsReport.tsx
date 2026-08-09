"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, Gauge, Lightbulb } from "lucide-react";
import type { AtsReport as AtsReportData, CheckStatus } from "@/lib/ats-report";

function scoreTone(score: number) {
  if (score >= 80) return { text: "text-emerald-600", bar: "bg-emerald-500", label: "Strong" };
  if (score >= 60) return { text: "text-amber-600", bar: "bg-amber-500", label: "Needs work" };
  return { text: "text-rose-600", bar: "bg-rose-500", label: "Weak" };
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  return <XCircle className="h-4 w-4 shrink-0 text-rose-500" />;
}

export default function AtsReport({ report, missing = [] }: { report: AtsReportData; missing?: string[] }) {
  const [open, setOpen] = useState(false);
  const tone = scoreTone(report.score);
  const issues = report.checks.filter((c) => c.status !== "pass").length;

  return (
    <div className="no-print glass rounded-2xl">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-5 text-left">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Gauge className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Resume report</span>
            <span className={`text-sm font-bold ${tone.text}`}>
              {report.score}/100 · {tone.label}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${report.score}%` }} />
          </div>
        </div>
        <span className="text-xs text-slate-400">{issues === 0 ? "All clear" : `${issues} to improve`}</span>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-5">
          <ul className="space-y-2.5">
            {report.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5">
                <StatusIcon status={c.status} />
                <div>
                  <div className="text-sm font-medium text-slate-800">{c.label}</div>
                  <div className="text-xs text-slate-500">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          {missing.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Lightbulb className="h-4 w-4 text-[var(--accent)]" /> Close the gap — truthfully
              </div>
              <p className="mt-1 text-xs text-slate-600">
                The job asks for these, and they&apos;re not in your resume. Add any you <span className="font-semibold">genuinely</span> have
                (in your profile or by editing a bullet) — don&apos;t invent them.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missing.slice(0, 20).map((m) => (
                  <span key={m} className="rounded-md border border-[var(--accent)]/30 bg-white px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
