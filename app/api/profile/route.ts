import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getProfile, saveProfile } from "@/lib/db";
import { MasterProfileSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load the signed-in user's saved profile. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const saved = getProfile(email);
  return NextResponse.json({ data: saved });
}

/** Persist the signed-in user's profile (auto-save). */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json();
    const profile = MasterProfileSchema.parse(body?.profile);
    const jd = typeof body?.jd === "string" ? body.jd : "";
    const template = typeof body?.template === "string" ? body.template : "modern";
    saveProfile(email, { profile, jd, template });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
