"use client";

import { CheckCircle2, XCircle, Wand2, Loader2, AlertTriangle } from "lucide-react";
import type { JdMatch as JdMatchData } from "@/lib/jd-match";

const LOW = 60;

function toneFor(pct: number) {
  if (pct >= 75) return { ring: "#16a34a", text: "text-emerald-600", label: "Strong match" };
  if (pct >= LOW) return { ring: "#d97706", text: "text-amber-600", label: "Partial match" };
  return { ring: "#e11d48", text: "text-rose-600", label: "Low match" };
}

/** Circular percentage gauge. */
function Gauge({ pct, color }: { pct: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="47" textAnchor="middle" className="fill-slate-900" style={{ font: "700 20px system-ui" }}>
        {pct}%
      </text>
    </svg>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "green" | "red" }) {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-600";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 18).map((s) => (
        <span key={s} className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
          {s}
        </span>
      ))}
      {items.length > 18 && <span className="text-xs text-slate-400">+{items.length - 18} more</span>}
      {items.length === 0 && <span className="text-xs text-slate-400">—</span>}
    </div>
  );
}

export default function JdMatch({
  match,
  fabricated,
  boosting,
  onBoost,
}: {
  match: JdMatchData;
  fabricated: boolean;
  boosting: boolean;
  onBoost: () => void;
}) {
  const tone = toneFor(match.pct);

  return (
    <div className="no-print glass rounded-2xl p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Gauge pct={match.pct} color={tone.ring} />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">JD Match</div>
            <div className={`text-lg font-bold ${tone.text}`}>{tone.label}</div>
            <div className="text-xs text-slate-500">
              {match.matched.length}/{match.total} key requirements present
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Matched
            </div>
            <Chips items={match.matched} tone="green" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <XCircle className="h-3.5 w-3.5" /> Missing
            </div>
            <Chips items={match.missing} tone="red" />
          </div>
        </div>
      </div>

      {!fabricated && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">
              {match.pct < LOW
                ? `Your resume matches only ${match.pct}% of this job. `
                : `Want an even stronger match? `}
              Generate a version rewritten to fully match the JD.{" "}
              <span className="font-semibold">This invents skills and experience you may not have</span> — a draft you must
              replace with your real details.
            </p>
          </div>
          <button
            onClick={onBoost}
            disabled={boosting}
            className="btn-primary flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {boosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            JD-matched draft
          </button>
        </div>
      )}
    </div>
  );
}
