import { NextRequest, NextResponse } from "next/server";
import { resumeDocx, coverLetterDocx } from "@/lib/docx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export a resume or cover letter as an editable .docx.
 * Body: { type: "resume"|"cover", kind: "template"|"upload", title, name, payload, coverLetter }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = body?.type === "cover" ? "cover" : "resume";

    let buffer: Buffer;
    let filename: string;
    const safe = (typeof body?.title === "string" ? body.title : "resume").replace(/[^\w.-]+/g, "_") || "resume";

    if (type === "cover") {
      const letter = typeof body?.coverLetter === "string" ? body.coverLetter : "";
      if (!letter.trim()) return NextResponse.json({ error: "No cover letter to export." }, { status: 400 });
      buffer = await coverLetterDocx(letter, typeof body?.name === "string" ? body.name : "");
      filename = `${safe}_CoverLetter.docx`;
    } else {
      const kind = body?.kind === "upload" ? "upload" : "template";
      const payload = body?.payload || {};
      buffer = await resumeDocx(kind, payload);
      filename = `${safe}.docx`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Word export failed: ${message}` }, { status: 500 });
  }
}
