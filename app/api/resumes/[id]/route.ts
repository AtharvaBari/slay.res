import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getResume, updateResume, deleteResume } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireEmail() {
  const session = await getServerSession(authOptions);
  return session?.user?.email || null;
}

/** Load one resume by id. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const row = getResume(email, params.id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ data: row });
}

/** Update a resume's title and/or payload (used for autosaving edits). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const body = await req.json();
    const patch: { title?: string; payload?: unknown; job?: any } = {};
    if (typeof body?.title === "string") patch.title = body.title.slice(0, 120);
    if (body?.payload !== undefined) patch.payload = body.payload;
    if (body?.job !== undefined && typeof body.job === "object") patch.job = body.job;
    const ok = updateResume(email, params.id, patch);
    if (!ok) return NextResponse.json({ error: "Not found or nothing to update." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Delete a resume. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  deleteResume(email, params.id);
  return NextResponse.json({ ok: true });
}
