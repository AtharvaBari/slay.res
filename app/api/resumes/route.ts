import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createResume, listResumes, type ResultKind } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the signed-in user's saved resumes (metadata only). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ data: listResumes(email) });
}

/** Create a new resume. Body: { title, kind: "template"|"upload", payload }. Returns { id }. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json();
    const kind = body?.kind as ResultKind;
    if (kind !== "template" && kind !== "upload") {
      return NextResponse.json({ error: "Invalid resume kind." }, { status: 400 });
    }
    if (typeof body?.payload !== "object" || body.payload === null) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Untitled resume";
    const job = body?.job && typeof body.job === "object" ? body.job : {};
    const id = createResume(email, { title, kind, payload: body.payload, job });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
