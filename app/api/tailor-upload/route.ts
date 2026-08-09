import { NextRequest, NextResponse } from "next/server";
import { tailorUploadBlocks, type TailorBlockInput } from "@/lib/upload-tailor";
import type { LayoutBlock } from "@/lib/pdf-layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tailor an uploaded resume's wording in place.
 * Body: { blocks: LayoutBlock[], jd: string, mode: "jd" | "grammar" }
 * Returns { blocks: LayoutBlock[] (rewritten body text), engine, warning }.
 * Only "body" blocks are rewritten; name/heading/contact stay verbatim.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const blocks = (Array.isArray(body?.blocks) ? body.blocks : []) as LayoutBlock[];
    const jd = typeof body?.jd === "string" ? body.jd : "";
    const mode: "jd" | "grammar" = body?.mode === "jd" ? "jd" : "grammar";

    if (!blocks.length) {
      return NextResponse.json({ error: "No blocks to tailor." }, { status: 400 });
    }

    const bodyBlocks: TailorBlockInput[] = blocks
      .filter((b) => b.kind === "body" && b.text.trim().length > 0)
      .map((b) => ({ id: b.id, text: b.text }));

    const { rewrites, engine, warning } = await tailorUploadBlocks(bodyBlocks, jd, mode);

    const out = blocks.map((b) =>
      b.kind === "body" && rewrites[b.id] !== undefined ? { ...b, text: rewrites[b.id] } : b
    );

    return NextResponse.json({ blocks: out, engine, warning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Failed to tailor: ${message}` }, { status: 500 });
  }
}
