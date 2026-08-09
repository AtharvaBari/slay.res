import { NextRequest, NextResponse } from "next/server";
import { generateCoverLetter } from "@/lib/cover-letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft a cover letter grounded in the candidate's resume text.
 * Body: { jd, name, baseText }. Returns { letter }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jd = typeof body?.jd === "string" ? body.jd : "";
    const name = typeof body?.name === "string" ? body.name : "";
    const baseText = typeof body?.baseText === "string" ? body.baseText : "";

    if (jd.trim().length < 20) {
      return NextResponse.json({ error: "A job description is required to write a cover letter." }, { status: 400 });
    }
    if (baseText.trim().length < 20) {
      return NextResponse.json({ error: "Your resume has too little content to ground a cover letter." }, { status: 400 });
    }

    const letter = await generateCoverLetter(jd, name, baseText);
    return NextResponse.json({ letter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Failed to write the cover letter: ${message}` }, { status: 500 });
  }
}
