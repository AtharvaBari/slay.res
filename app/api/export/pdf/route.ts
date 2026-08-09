import { NextRequest, NextResponse } from "next/server";
import { renderResumePdf, type PdfMode } from "@/lib/pdf-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generate a real, one-click PDF with @react-pdf/renderer (consistent on every
 * machine, embedded fonts, selectable text).
 * Body: { kind: "template"|"upload", mode: "styled"|"ats", title, payload }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === "upload" ? "upload" : "template";
    const mode: PdfMode = body?.mode === "ats" ? "ats" : "styled";
    if (typeof body?.payload !== "object" || body.payload === null) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

    const buffer = await renderResumePdf({ kind, mode, payload: body.payload });
    const safe = (typeof body?.title === "string" ? body.title : "resume").replace(/[^\w.-]+/g, "_") || "resume";
    const filename = mode === "ats" ? `${safe}_ATS.pdf` : `${safe}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `PDF export failed: ${message}` }, { status: 500 });
  }
}
