"use client";

import { useState } from "react";
import { X, Wand2, Loader2, Copy, CheckCircle2, FileType, Mail, RefreshCw } from "lucide-react";

/** Slide-over panel for generating, editing, and exporting a cover letter that
 * is saved alongside the resume. Grounded in the resume text + JD. */
export default function CoverLetterPanel({
  letter,
  onChange,
  onGenerate,
  generating,
  error,
  hasJd,
  onWord,
  downloadingWord,
  onClose,
}: {
  letter: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
  hasJd: boolean;
  onWord: () => void;
  downloadingWord: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[var(--accent)]" />
            <h3 className="text-lg font-bold text-slate-900">Cover letter</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-auto p-5">
          {!hasJd && !letter ? (
            <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-6 text-center text-sm text-slate-500">
              Cover letters are grounded in a job description. Generate this resume{" "}
              <span className="font-medium text-slate-700">tailored to a JD</span> to enable a cover letter.
            </div>
          ) : !letter ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Mail className="h-7 w-7" />
              </div>
              <p className="max-w-xs text-sm text-slate-500">
                Draft a tailored cover letter from your resume and the job description.
              </p>
              <button
                onClick={onGenerate}
                disabled={generating}
                className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {generating ? "Writing…" : "Generate cover letter"}
              </button>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
          ) : (
            <>
              <textarea
                value={letter}
                onChange={(e) => onChange(e.target.value)}
                className="field min-h-[420px] w-full flex-1 resize-none rounded-xl p-4 text-sm leading-relaxed text-slate-800"
              />
              {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            </>
          )}
        </div>

        {letter && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-4">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerate
            </button>
            <button onClick={copy} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <div className="flex-1" />
            <button
              onClick={onWord}
              disabled={downloadingWord}
              className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {downloadingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType className="h-4 w-4" />} Download Word
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
