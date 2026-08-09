"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  FileText,
  UploadCloud,
  ArrowRight,
  Loader2,
  UserPlus,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { profileHasContent } from "@/lib/profile";

/** Dashboard — the post-login home. Two ways to build a tailored resume:
 *  from your saved profile, or from an existing PDF you upload. */
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!cancelled && res.ok) {
          const { data } = await res.json();
          setHasProfile(!!(data?.profile && profileHasContent(data.profile)));
        } else if (!cancelled) {
          setHasProfile(false);
        }
      } catch {
        if (!cancelled) setHasProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    );
  }

  const firstName = (session?.user?.name || "").split(" ")[0];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="mt-1.5 text-slate-500">Choose how you want to build your tailored resume.</p>
        </motion.div>

        {/* Profile setup nudge */}
        {hasProfile === false && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3.5 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-2.5">
              <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
              <p className="text-sm text-slate-700">
                Set up your profile first so we can build a resume from your details.
              </p>
            </div>
            <Link href="/profile" className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm">
              Set up profile
            </Link>
          </motion.div>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <SourceCard
            href="/tailor?source=profile"
            icon={<FileText className="h-6 w-6" />}
            title="From my profile"
            desc="Generate a resume from your saved profile details, then tailor it to a job description — or just polish the grammar."
            cta="Use my details"
          />
          <SourceCard
            href="/tailor?source=upload"
            icon={<UploadCloud className="h-6 w-6" />}
            title="Upload existing resume"
            desc="Keep your resume's exact look — same fonts, sizes and layout — and only tailor the wording to a job description or fix grammar."
            cta="Upload a PDF"
          />
        </div>

        <div className="mt-10 flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4" />
          Everything you generate opens in a fully editable Results page you can download as a PDF.
        </div>
      </main>
    </div>
  );
}

function SourceCard({
  href,
  icon,
  title,
  desc,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      <Link
        href={href}
        className="glass group flex h-full flex-col rounded-2xl p-6 transition hover:border-[var(--accent)]/40"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{desc}</p>
        <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
          {cta}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </Link>
    </motion.div>
  );
}
