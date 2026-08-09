"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const LINE_WIDTHS = ["72%", "94%", "84%", "60%", "90%", "68%"];

/** A clean, animated full-screen loader shown while a resume is being tailored:
 * a résumé "building itself" (pulsing skeleton lines + shimmer sweep), a
 * floating sparkle, a cross-fading status line, and an indeterminate bar. */
export default function GeneratingOverlay({
  title = "Tailoring your resume",
  msg,
}: {
  title?: string;
  msg?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 grid place-items-center bg-white/85 backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-7 px-6">
        {/* Résumé building itself */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="relative"
          style={{ animation: "float-y 3s ease-in-out infinite" }}
        >
          <div className="absolute -inset-6 rounded-full bg-[var(--accent)]/15 blur-2xl" />
          <div className="relative h-32 w-24 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl">
            <div className="h-7 bg-[var(--accent)]" />
            <div className="space-y-2 p-3">
              {LINE_WIDTHS.map((w, i) => (
                <div
                  key={i}
                  className="h-1.5 origin-left rounded-full bg-slate-200"
                  style={{ width: w, animation: `line-pulse 1.4s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </div>
            {/* shimmer sweep */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent"
                style={{ animation: "shimmer-sweep 1.9s ease-in-out infinite" }}
              />
            </div>
          </div>
          <div
            className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg"
            style={{ animation: "float-y 2.2s ease-in-out infinite" }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
        </motion.div>

        <div className="text-center">
          <div className="text-base font-bold text-slate-900">{title}</div>
          <div className="mt-1 h-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={msg}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -7 }}
                transition={{ duration: 0.3 }}
                className="text-sm text-slate-500"
              >
                {msg || "Working…"}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Indeterminate progress */}
        <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-slate-200/70">
          <div
            className="absolute top-0 h-full rounded-full bg-[var(--accent)]"
            style={{ animation: "indeterminate 1.6s ease-in-out infinite" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
