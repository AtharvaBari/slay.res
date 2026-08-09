"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutGrid, User, FileStack } from "lucide-react";
import UserMenu from "@/components/UserMenu";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutGrid className="h-4 w-4" /> },
  { href: "/resumes", label: "My Resumes", icon: <FileStack className="h-4 w-4" /> },
  { href: "/profile", label: "Profile", icon: <User className="h-4 w-4" /> },
];

/** Shared top navigation for the authenticated app (dashboard, profile,
 * tailor, results). Brand on the left → dashboard; Dashboard/Profile links and
 * the user menu on the right. */
export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[var(--border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Slay.res" className="h-8 w-8" />
          <span className="text-lg font-black tracking-tight text-slate-900">
            Slay<span className="text-slate-400">.res</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.icon}
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
          {session?.user && (
            <div className="ml-1">
              <UserMenu user={session.user} />
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
