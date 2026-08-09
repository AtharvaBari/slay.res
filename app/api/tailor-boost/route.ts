import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createResume } from "@/lib/db";
import { fabricateResume, type Identity } from "@/lib/fabricate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generate a JD-matched DRAFT that intentionally invents experience/skills to
 * fully match the job description (opt-in; the caller shows a warning). Keeps
 * the candidate's real identity. Persists as the latest template result flagged
 * `fabricated: true`.
 * Body: { jd, name, email, phone, location, links[], education[], baseText }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const jd = typeof body?.jd === "string" ? body.jd : "";
    if (jd.trim().length < 20) {
      return NextResponse.json({ error: "A job description is required to generate a matched draft." }, { status: 400 });
    }

    const identity: Identity = {
      name: typeof body?.name === "string" ? body.name : "",
      email: typeof body?.email === "string" ? body.email : "",
      phone: typeof body?.phone === "string" ? body.phone : "",
      location: typeof body?.location === "string" ? body.location : "",
      links: Array.isArray(body?.links) ? body.links.filter((l: unknown) => typeof l === "string") : [],
      education: Array.isArray(body?.education)
        ? body.education
            .filter((e: unknown) => e && typeof e === "object")
            .map((e: any, i: number) => ({
              id: typeof e.id === "string" ? e.id : `edu${i + 1}`,
              institution: e.institution ?? "",
              degree: e.degree ?? "",
              date_range: e.date_range ?? "",
            }))
        : [],
    };
    const baseText = typeof body?.baseText === "string" ? body.baseText : "";

    const { result, profile, engine } = await fabricateResume(jd, identity, baseText);

    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "JD-matched draft";
    const id = createResume(email, {
      title: title.slice(0, 120),
      kind: "template",
      payload: { result, profile, jd, template: "modern", fabricated: true, engine },
    });

    return NextResponse.json({ ok: true, id, engine });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Failed to generate a matched draft: ${message}` }, { status: 500 });
  }
}
