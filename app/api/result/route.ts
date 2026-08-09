import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getResult, saveResult, type ResultKind } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load the signed-in user's most recently generated result (template or upload). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const saved = getResult(email);
  return NextResponse.json({ data: saved });
}

/** Persist a generated result (used by the upload tailoring path). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json();
    const kind = body?.kind as ResultKind;
    if (kind !== "template" && kind !== "upload") {
      return NextResponse.json({ error: "Invalid result kind." }, { status: 400 });
    }
    if (typeof body?.payload !== "object" || body.payload === null) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }
    saveResult(email, { kind, payload: body.payload });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid result.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
