import { NextRequest, NextResponse } from "next/server";
import { extractPdfLayout } from "@/lib/pdf-layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Extract a faithful, editable layout from an uploaded resume PDF.
 * Body: multipart/form-data with a `file` (PDF).
 * Returns { pages: [{width,height}], blocks: LayoutBlock[] } — positioned,
 * classified text blocks that reproduce the original document.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Upload a PDF file (multipart/form-data)." }, { status: 400 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    const blob = file as File;
    if (!/pdf$/i.test(blob.type) && !/\.pdf$/i.test(blob.name)) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const layout = await extractPdfLayout(buffer);
    if (!layout.blocks.length) {
      return NextResponse.json(
        { error: "Could not read any text — the PDF may be a scanned image." },
        { status: 422 }
      );
    }
    return NextResponse.json(layout);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Failed to read the PDF: ${message}` }, { status: 500 });
  }
}
