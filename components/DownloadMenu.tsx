"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileText, FileCheck2, FileType, Printer, Loader2 } from "lucide-react";

/** Dropdown of export options for a résumé: styled PDF, ATS-friendly PDF, Word,
 * and browser print. */
export default function DownloadMenu({
  onStyledPdf,
  onAtsPdf,
  onWord,
  onPrint,
  busy,
}: {
  onStyledPdf: () => void;
  onAtsPdf: () => void;
  onWord: () => void;
  onPrint: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const item = (icon: React.ReactNode, label: string, sub: string, onClick: () => void) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
    >
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{sub}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl">
          {item(<FileText className="h-4 w-4" />, "PDF — styled", "Polished, matches the preview.", onStyledPdf)}
          {item(<FileCheck2 className="h-4 w-4" />, "PDF — ATS-friendly", "Plain single-column for parsers.", onAtsPdf)}
          {item(<FileType className="h-4 w-4" />, "Word (.docx)", "Editable in Microsoft Word.", onWord)}
          <div className="border-t border-[var(--border)]" />
          {item(<Printer className="h-4 w-4" />, "Print…", "Use your browser's print dialog.", onPrint)}
        </div>
      )}
    </div>
  );
}
