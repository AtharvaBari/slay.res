import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  BorderStyle,
} from "docx";
import type { AlignmentResult, MasterProfile } from "./schema";
import type { LayoutBlock } from "./pdf-layout";

/* Build editable .docx files (resume or cover letter) with the `docx` library.
 * The template resume maps the structured result → styled Word paragraphs; the
 * upload resume maps its classified blocks → Word (layout is not preserved, but
 * the content becomes fully editable in Word). */

const RIGHT_TAB = 9026; // ~6.5in for right-aligned dates

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 24, color: "222222" })],
  });
}

function entryHead(title: string, date: string): Paragraph {
  const children = [new TextRun({ text: title, bold: true, size: 22 })];
  if (date) children.push(new TextRun({ text: `\t${date}`, italics: true, size: 18, color: "555555" }));
  return new Paragraph({
    tabStops: date ? [{ type: TabStopType.RIGHT, position: RIGHT_TAB }] : undefined,
    spacing: { before: 120, after: 20 },
    children,
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text, size: 20 })] });
}

function headerParagraphs(name: string, contactBits: string[]): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: name || "Your Name", bold: true, size: 34 })],
    }),
  ];
  if (contactBits.length) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: contactBits.join("  ·  "), size: 18, color: "555555" })],
      })
    );
  }
  return out;
}

function templateParagraphs(profile: MasterProfile, result: AlignmentResult): Paragraph[] {
  const c = profile.contact;
  const contactBits = [c.email, c.phone, c.location, ...c.links].filter(Boolean);
  const paras: Paragraph[] = [...headerParagraphs(c.name, contactBits)];
  const order = profile.section_order?.length
    ? profile.section_order
    : ["summary", "experiences", "projects", "education", "skills"];
  const skills = result.verified_skills.length ? result.verified_skills : profile.skills;

  for (const key of order) {
    if (key === "summary" && result.tailored_summary.trim()) {
      paras.push(heading("Summary"));
      paras.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: result.tailored_summary, size: 20 })] }));
    } else if (key === "experiences" && result.experiences.length) {
      paras.push(heading("Experience"));
      for (const e of result.experiences) {
        paras.push(entryHead([e.role_title, e.company].filter(Boolean).join(" — "), e.date_range));
        for (const b of e.bullet_points) if (b.tailored_text.trim()) paras.push(bullet(b.tailored_text));
      }
    } else if (key === "projects" && result.projects.length) {
      paras.push(heading("Projects"));
      for (const p of result.projects) {
        paras.push(entryHead([p.role_title, p.name].filter(Boolean).join(" — "), p.date_range));
        for (const b of p.bullet_points) if (b.tailored_text.trim()) paras.push(bullet(b.tailored_text));
      }
    } else if (key === "education" && profile.education.length) {
      paras.push(heading("Education"));
      for (const ed of profile.education) {
        paras.push(entryHead([ed.institution, ed.degree].filter(Boolean).join(" — "), ed.date_range));
      }
    } else if (key === "skills" && skills.length) {
      paras.push(heading("Skills"));
      paras.push(new Paragraph({ children: [new TextRun({ text: skills.join(", "), size: 20 })] }));
    } else if (key.startsWith("custom:")) {
      const title = key.replace("custom:", "");
      const sec = result.custom_sections.find((s) => s.section_title === title);
      if (sec && sec.items.length) {
        paras.push(heading(sec.section_title));
        for (const it of sec.items) {
          paras.push(entryHead([it.role_title, it.name].filter(Boolean).join(" — "), it.date_range));
          for (const b of it.bullet_points) if (b.tailored_text.trim()) paras.push(bullet(b.tailored_text));
        }
      }
    }
  }
  return paras;
}

function uploadParagraphs(blocks: LayoutBlock[]): Paragraph[] {
  const ordered = [...blocks].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const paras: Paragraph[] = [];
  for (const b of ordered) {
    if (!b.text.trim() && b.kind !== "name") continue;
    if (b.kind === "name") {
      paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b.text, bold: true, size: 34 })] }));
    } else if (b.kind === "contact") {
      paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: b.text, size: 18, color: "555555" })] }));
    } else if (b.kind === "heading") {
      paras.push(heading(b.text));
    } else if (b.bullet) {
      paras.push(bullet(b.text));
    } else {
      paras.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.text, size: 20 })] }));
    }
  }
  return paras;
}

export async function resumeDocx(
  kind: "template" | "upload",
  payload: { result?: AlignmentResult; profile?: MasterProfile; blocks?: LayoutBlock[] }
): Promise<Buffer> {
  const children =
    kind === "template" && payload.result && payload.profile
      ? templateParagraphs(payload.profile, payload.result)
      : uploadParagraphs(payload.blocks || []);
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export async function coverLetterDocx(letter: string, name: string): Promise<Buffer> {
  const paras: Paragraph[] = [];
  if (name) paras.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: name, bold: true, size: 24 })] }));
  for (const block of letter.split(/\n\s*\n/)) {
    const text = block.replace(/\n/g, " ").trim();
    if (text) paras.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, size: 22 })] }));
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: paras }],
  });
  return Packer.toBuffer(doc);
}
