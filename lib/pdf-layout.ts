import { spawn } from "child_process";

/* ------------------------------------------------------------------ *
 *  Faithful PDF layout extraction.
 *
 *  Extracts every text run from a PDF with its position, font, and size
 *  (via pdfjs-dist in a subprocess — mirrors the pdf-parse subprocess in
 *  app/api/parse/route.ts), then groups runs into lines and lines into
 *  positioned blocks. Each block reproduces a paragraph/bullet/heading in
 *  place so the uploaded resume can be rebuilt as an editable, same-look
 *  document whose wording we can tailor without disturbing the layout.
 * ------------------------------------------------------------------ */

export interface RawRun {
  str: string;
  x: number; // left, in PDF points (top-left origin)
  top: number; // top of the glyph box, in points from page top
  baseline: number; // baseline from page top
  fontSize: number;
  font: string; // best-effort real font name
  width: number;
}

export interface RawPage {
  width: number;
  height: number;
  runs: RawRun[];
}

export type BlockKind = "name" | "heading" | "contact" | "body";

export interface LayoutBlock {
  id: string;
  page: number;
  x: number;
  y: number; // top, in points
  width: number;
  fontSize: number;
  fontFamily: string; // CSS font stack
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  text: string;
  kind: BlockKind;
  bullet: string; // leading marker kept verbatim ("• ", "- ", "" …)
}

export interface LayoutDoc {
  pages: { width: number; height: number }[];
  blocks: LayoutBlock[];
}

const BULLET_RE = /^\s*([•▪◦‣·・●○*\-–—])\s+/;

/** Spawn a Node subprocess that runs pdfjs (ESM) and streams positioned runs. */
export function extractPdfRuns(buffer: Buffer): Promise<RawPage[]> {
  return new Promise((resolve, reject) => {
    const script = `
      (async () => {
        const chunks = [];
        for await (const c of process.stdin) chunks.push(c);
        const data = new Uint8Array(Buffer.concat(chunks));
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;
        const pages = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const styles = content.styles || {};
          const runs = [];
          for (const item of content.items) {
            if (!item.str || !item.str.trim()) continue;
            const tr = item.transform;
            const fontSize = Math.hypot(tr[2], tr[3]) || item.height || 11;
            const x = tr[4];
            const baseline = vp.height - tr[5];
            let font = "";
            try {
              if (page.commonObjs.has(item.fontName)) {
                const f = page.commonObjs.get(item.fontName);
                font = (f && (f.name || f.loadedName)) || "";
              }
            } catch (e) {}
            if (!font) font = (styles[item.fontName] && styles[item.fontName].fontFamily) || "";
            runs.push({
              str: item.str,
              x,
              top: baseline - fontSize,
              baseline,
              fontSize,
              font,
              width: item.width || 0,
            });
          }
          pages.push({ width: vp.width, height: vp.height, runs });
        }
        process.stdout.write(JSON.stringify(pages));
        process.exit(0);
      })().catch((err) => {
        process.stderr.write(String(err && err.stack || err));
        process.exit(1);
      });
    `;
    const child = spawn(process.execPath, ["-e", script], { cwd: process.cwd() });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("PDF layout extraction failed: " + err));
      try {
        resolve(JSON.parse(out) as RawPage[]);
      } catch (e) {
        reject(new Error("Could not parse layout output: " + (e as Error).message));
      }
    });
    child.stdin.write(buffer);
    child.stdin.end();
  });
}

/** Map a font's real name to a CSS stack + weight/style flags. */
function resolveFont(name: string): { family: string; bold: boolean; italic: boolean } {
  const n = (name || "").toLowerCase();
  const bold = /bold|black|heavy|semibold|semi-bold|demibold/.test(n);
  const italic = /italic|oblique/.test(n);
  let family = "Arial, Helvetica, sans-serif";
  if (/times|serif|georgia|garamond|minion|charter|roman|cambria|book antiqua|palatino/.test(n)) {
    family = "'Times New Roman', Times, Georgia, serif";
  } else if (/courier|mono|consol/.test(n)) {
    family = "'Courier New', monospace";
  } else if (/calibri|arial|helvetica|verdana|tahoma|segoe|lato|open ?sans|roboto|sans/.test(n)) {
    family = "Arial, Helvetica, sans-serif";
  }
  return { family, bold, italic };
}

interface Line {
  x: number;
  right: number;
  top: number;
  baseline: number;
  fontSize: number;
  font: string;
  text: string;
}

/** Merge runs on the same baseline into text lines (inserting spaces across gaps). */
function runsToLines(runs: RawRun[]): Line[] {
  const sorted = [...runs].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const lines: Line[] = [];
  for (const r of sorted) {
    const tol = Math.max(2, r.fontSize * 0.4);
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur.baseline - r.baseline) <= tol) {
      // same line — insert a space if there's a horizontal gap
      const gap = r.x - cur.right;
      const needsSpace = gap > r.fontSize * 0.22 && !/\s$/.test(cur.text) && !/^\s/.test(r.str);
      cur.text += (needsSpace ? " " : "") + r.str;
      cur.right = Math.max(cur.right, r.x + r.width);
      cur.fontSize = Math.max(cur.fontSize, r.fontSize);
      cur.top = Math.min(cur.top, r.top);
    } else {
      lines.push({
        x: r.x,
        right: r.x + r.width,
        top: r.top,
        baseline: r.baseline,
        fontSize: r.fontSize,
        font: r.font,
        text: r.str,
      });
    }
  }
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text);
}

/** A short, all-caps or larger-than-body line reads as a section heading. */
function isHeadingLine(text: string, fontSize: number, bodySize: number): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const allCaps = letters.length > 1 && letters === letters.toUpperCase();
  const short = text.trim().length <= 40;
  return short && (allCaps || fontSize > bodySize + 1);
}

/** Group consecutive lines into paragraph/bullet/heading blocks. */
function linesToBlocks(lines: Line[], page: number, pageHeight: number, bodySize: number, idBase: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let idc = idBase;

  let group: Line[] = [];
  const flush = () => {
    if (!group.length) return;
    const x = Math.min(...group.map((l) => l.x));
    const right = Math.max(...group.map((l) => l.right));
    const top = Math.min(...group.map((l) => l.top));
    const fontSize = Math.max(...group.map((l) => l.fontSize));
    const font = group[0].font;
    const { family, bold, italic } = resolveFont(font);
    let text = group.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
    let bullet = "";
    const m = text.match(BULLET_RE);
    if (m) {
      bullet = m[1] + " ";
      text = text.replace(BULLET_RE, "");
    }
    blocks.push({
      id: `b${idc++}`,
      page,
      x,
      y: top,
      width: Math.max(right - x, 40),
      fontSize,
      fontFamily: family,
      bold,
      italic,
      align: "left",
      text,
      kind: "body",
      bullet,
    });
    group = [];
  };

  for (const line of lines) {
    const prev = group[group.length - 1];
    if (!prev) {
      group.push(line);
      continue;
    }
    const gap = line.baseline - prev.baseline;
    const startsBullet = BULLET_RE.test(line.text);
    const leftJump = line.x < prev.x - 12; // moved left of the block → new block
    const sizeJump = Math.abs(line.fontSize - prev.fontSize) > 1.5;
    const bigGap = gap > prev.fontSize * 1.8;
    // A heading stands on its own line — break before it and after it, so a
    // uniform-font resume still separates "SUMMARY"/"EXPERIENCE" from the body.
    const curHeading = isHeadingLine(line.text, line.fontSize, bodySize);
    const prevHeading = isHeadingLine(prev.text, prev.fontSize, bodySize);
    if (startsBullet || leftJump || sizeJump || bigGap || curHeading || prevHeading) {
      flush();
    }
    group.push(line);
  }
  flush();

  // classify
  const maxSize = Math.max(...blocks.map((b) => b.fontSize), bodySize);
  let nameAssigned = false;
  for (const b of blocks) {
    const upper = b.text.replace(/[^A-Za-z]/g, "");
    const isUpper = upper.length > 1 && upper === upper.toUpperCase();
    const short = b.text.length <= 40;
    // Contact lines carry an email / url / phone. Keep the pattern conservative
    // so a body bullet that merely mentions GitHub or a year isn't mistaken.
    const hasContact = /\S+@\S+\.\S+|https?:\/\/|www\.[a-z]|linkedin\.com|github\.com|\+\d[\d ()\-]{7,}|\(\d{3}\)\s*\d{3}/i.test(b.text);
    const nearTop = b.page === 0 && b.y < pageHeight * 0.22;

    if (b.bullet) {
      b.kind = "body";
    } else if (!nameAssigned && b.page === 0 && b.fontSize >= maxSize - 0.5 && b.y < pageHeight * 0.28 && b.text.length <= 48 && !hasContact) {
      b.kind = "name";
      nameAssigned = true;
    } else if (nearTop && hasContact) {
      b.kind = "contact";
    } else if (short && (isUpper || b.bold || b.fontSize > bodySize + 1) && !hasContact) {
      b.kind = "heading";
    } else {
      b.kind = "body";
    }
  }
  return blocks;
}

/** Full pipeline: buffer → positioned, classified, editable blocks. */
export async function extractPdfLayout(buffer: Buffer): Promise<LayoutDoc> {
  const pages = await extractPdfRuns(buffer);
  if (!pages.length || pages.every((p) => p.runs.length === 0)) {
    throw new Error("No selectable text found — the PDF may be a scanned image.");
  }

  // Body font size = the most common run size (rounded), used for classification.
  const sizeCounts = new Map<number, number>();
  for (const p of pages) for (const r of p.runs) {
    const s = Math.round(r.fontSize);
    sizeCounts.set(s, (sizeCounts.get(s) || 0) + r.str.length);
  }
  let bodySize = 11;
  let best = 0;
  for (const [s, c] of sizeCounts) if (c > best) { best = c; bodySize = s; }

  const blocks: LayoutBlock[] = [];
  let idBase = 1;
  pages.forEach((p, i) => {
    const lines = runsToLines(p.runs);
    const pageBlocks = linesToBlocks(lines, i, p.height, bodySize, idBase);
    idBase += pageBlocks.length + 1;
    blocks.push(...pageBlocks);
  });

  return {
    pages: pages.map((p) => ({ width: p.width, height: p.height })),
    blocks,
  };
}
