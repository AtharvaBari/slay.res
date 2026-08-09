"use client";

import { useEffect, useRef, useState } from "react";
import type { LayoutBlock } from "@/lib/pdf-layout";

const PT_TO_PX = 96 / 72;

/** A single inline-editable text node (commit on blur → no caret jump). */
function EditableText({
  value,
  onCommit,
  editable,
}: {
  value: string;
  onCommit: (v: string) => void;
  editable: boolean;
}) {
  if (!editable) return <>{value}</>;
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className="editable"
      style={{ display: "inline-block", minWidth: "1ch", width: "100%" }}
      onBlur={(e) => {
        const next = e.currentTarget.innerText.replace(/ /g, " ").trimEnd();
        if (next !== value) onCommit(next);
      }}
    >
      {value}
    </span>
  );
}

/** Faithful, editable reconstruction of an uploaded resume: every text block is
 * absolutely positioned at its original coordinates with the original font and
 * size (in pt, so it prints at true size). Scales responsively on screen via a
 * transform; prints 1:1. Mark the outer node `resume-sheet print-exact` at the
 * call site so Download captures exactly this. */
export default function UploadedResume({
  pages,
  blocks,
  editable = false,
  onEdit,
  className = "",
}: {
  pages: { width: number; height: number }[];
  blocks: LayoutBlock[];
  editable?: boolean;
  onEdit?: (id: string, text: string) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const pageWidthPx = (pages[0]?.width || 612) * PT_TO_PX;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth;
      setScale(Math.min(1, avail / pageWidthPx));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx]);

  // Print at the original page size with no page margin (screen scale ignored
  // in print via the media query below).
  const firstPage = pages[0] || { width: 612, height: 792 };

  return (
    <div ref={wrapRef} className={className}>
      <style>{`@media print {
        @page { size: ${firstPage.width}pt ${firstPage.height}pt; margin: 0; }
        .upl-stack { gap: 0 !important; }
        .upl-scale { transform: none !important; }
        .upl-wrap { height: auto !important; overflow: visible !important; break-inside: avoid; }
        .upl-wrap + .upl-wrap { break-before: page; }
      }`}</style>
      <div className="upl-stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {pages.map((page, pi) => {
          const pageBlocks = blocks.filter((b) => b.page === pi);
          const wPx = page.width * PT_TO_PX;
          const hPx = page.height * PT_TO_PX;
          return (
            <div
              key={pi}
              className="upl-wrap"
              style={{ width: "100%", height: hPx * scale, overflow: "hidden" }}
            >
              <div
                className="upl-scale"
                style={{
                  width: `${page.width}pt`,
                  height: `${page.height}pt`,
                  position: "relative",
                  background: "#fff",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  boxShadow: editable ? "none" : "0 1px 2px rgba(15,23,42,0.05)",
                }}
              >
                {pageBlocks.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      position: "absolute",
                      left: `${b.x}pt`,
                      top: `${b.y}pt`,
                      width: `${b.width + 2}pt`,
                      fontSize: `${b.fontSize}pt`,
                      fontFamily: b.fontFamily,
                      fontWeight: b.bold ? 700 : 400,
                      fontStyle: b.italic ? "italic" : "normal",
                      lineHeight: 1.15,
                      textAlign: b.align,
                      color: "#111827",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {b.bullet ? (
                      <span style={{ display: "inline-block", marginRight: "0.15em" }} contentEditable={false}>
                        {b.bullet}
                      </span>
                    ) : null}
                    <EditableText
                      value={b.text}
                      editable={editable}
                      onCommit={(v) => onEdit?.(b.id, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
