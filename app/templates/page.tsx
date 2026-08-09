"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LayoutTemplate, X, Eye } from "lucide-react";
import Navbar from "@/components/Navbar";
import { ResumeDoc, TEMPLATES, type TemplateId } from "@/components/ResumeDoc";
import type { MasterProfile } from "@/lib/schema";

const dummyProfile: MasterProfile = {
  contact: {
    name: "Alex Sterling",
    email: "alex.sterling@example.com",
    phone: "(555) 123-4567",
    location: "San Francisco, CA",
    links: ["linkedin.com/in/alex", "github.com/alex"],
  },
  summary:
    "Product-focused Software Engineer with 5+ years of experience building scalable, user-centric web applications. Proven ability to lead cross-functional teams, optimize performance, and deliver high-impact features from zero to production. Passionate about system architecture and seamless user experiences.",
  experiences: [
    {
      id: "exp1",
      company: "TechNova Inc.",
      role_title: "Senior Full Stack Engineer",
      date_range: "Jan 2021 – Present",
      bullets: [
        { id: "b1", text: "Architected a distributed microservices platform using Node.js and gRPC, reducing latency by 45% and scaling to 2M daily active users." },
        { id: "b2", text: "Led a team of 4 engineers to migrate legacy React codebase to Next.js, improving SEO metrics and Core Web Vitals by 30%." },
        { id: "b3", text: "Implemented a real-time analytics dashboard with WebSockets and Redis, providing actionable insights to the marketing team." },
      ],
    },
    {
      id: "exp2",
      company: "CloudData Solutions",
      role_title: "Software Engineer",
      date_range: "Jun 2018 – Dec 2020",
      bullets: [
        { id: "b4", text: "Developed high-throughput API endpoints using Node.js and PostgreSQL, processing over 10k+ requests per second with 99.99% uptime." },
        { id: "b5", text: "Automated deployment pipelines using GitHub Actions and Docker, reducing build times from 15 minutes to under 3 minutes." },
        { id: "b6", text: "Integrated Stripe payment gateway, securely processing $5M+ in annual transaction volume with zero downtime." },
      ],
    },
    {
      id: "exp3",
      company: "StartupLab",
      role_title: "Frontend Developer Intern",
      date_range: "May 2017 – Aug 2017",
      bullets: [
        { id: "b7", text: "Built responsive landing pages using HTML, CSS, and Vanilla JavaScript, increasing lead generation conversion rates by 15%." },
      ],
    },
  ],
  projects: [
    {
      id: "proj1",
      name: "OpenFlow Analytics",
      role_title: "An open-source traffic analysis tool for small businesses.",
      date_range: "2023",
      bullets: [
        { id: "pb1", text: "Engineered a lightweight tracking script and a React dashboard, gathering 5k+ stars on GitHub." },
        { id: "pb2", text: "Utilized ClickHouse for fast analytical queries on millions of recorded events." },
      ],
    },
    {
      id: "proj2",
      name: "TaskSync App",
      role_title: "Real-time collaborative task manager.",
      date_range: "2021",
      bullets: [
        { id: "pb3", text: "Built with React Native and Firebase, reaching 10,000+ downloads on iOS App Store." },
      ],
    },
  ],
  custom_sections: [],
  education: [
    { id: "edu1", institution: "University of Technology", degree: "B.S. Computer Science", date_range: "2014 – 2018" },
  ],
  skills: ["TypeScript", "React", "Next.js", "Node.js", "Python", "SQL", "PostgreSQL", "AWS", "Docker", "GraphQL", "System Design", "Redis", "Tailwind CSS"],
  section_order: ["summary", "experiences", "projects", "education", "skills"],
};

function TemplatesGallery() {
  const params = useSearchParams();
  const idParam = params.get("id");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateId | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href={idParam ? `/results?id=${idParam}` : "/dashboard"}
              className="btn-ghost mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" /> Back to {idParam ? "resume" : "dashboard"}
            </Link>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
              <LayoutTemplate className="h-8 w-8 text-violet-600" />
              Template Gallery
            </h1>
            <p className="mt-2 text-slate-600">
              Choose from {TEMPLATES.length} professionally designed, ATS-friendly templates.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TEMPLATES.map((t) => {
            const destUrl = idParam ? `/results?id=${idParam}&apply_template=${t.id}` : "#";

            return (
              <div key={t.id} className="group relative flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-lg hover:ring-[var(--accent)]">
                {/* Scaled Preview Wrapper */}
                <div className="relative flex justify-center h-[420px] w-full overflow-hidden rounded-t-2xl border-b border-slate-100 bg-slate-200">
                  {/* The actual resume gets rendered at full 800px width and fixed A4 height, then scaled down */}
                  <div 
                    className="absolute top-4 w-[790px] h-[1117px] overflow-hidden origin-top bg-white shadow-xl rounded-sm p-[12mm] pointer-events-none"
                    style={{ transform: "scale(0.32)" }}
                  >
                    <ResumeDoc profile={dummyProfile} template={t.id} />
                  </div>
                  
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900/0 opacity-0 transition-all group-hover:bg-slate-900/20 group-hover:opacity-100">
                    <Link
                      href={destUrl}
                      onClick={(e) => {
                        if (!idParam) {
                          e.preventDefault();
                          alert("Please create or open a resume from the dashboard first to apply a template.");
                        }
                      }}
                      className="btn-primary scale-95 rounded-xl px-6 py-2.5 font-semibold opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    >
                      Use Template
                    </Link>
                    <button
                      onClick={() => setPreviewTemplate(t.id)}
                      className="btn-ghost flex items-center gap-2 scale-95 rounded-xl bg-white/90 backdrop-blur-sm px-5 py-2.5 font-semibold text-slate-700 opacity-0 transition-all duration-200 hover:bg-white hover:text-slate-900 group-hover:scale-100 group-hover:opacity-100"
                    >
                      <Eye className="h-4 w-4" /> Preview
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-center p-5">
                  <h3 className="text-lg font-bold text-slate-900">{t.label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPreviewTemplate(null)} />
          <div className="relative z-10 flex h-full max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl bg-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">
                {TEMPLATES.find(t => t.id === previewTemplate)?.label} Preview
              </h2>
              <button onClick={() => setPreviewTemplate(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="mx-auto w-[790px] min-h-[1117px] bg-white shadow-xl p-[12mm] shrink-0">
                <ResumeDoc profile={dummyProfile} template={previewTemplate} />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white px-6 py-4 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setPreviewTemplate(null)} className="btn-ghost rounded-xl px-5 py-2.5 font-medium text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <Link
                href={idParam ? `/results?id=${idParam}&apply_template=${previewTemplate}` : "#"}
                onClick={(e) => {
                  if (!idParam) {
                    e.preventDefault();
                    alert("Please create or open a resume from the dashboard first to apply a template.");
                  }
                }}
                className="btn-primary rounded-xl px-6 py-2.5 font-semibold"
              >
                Use This Template
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense>
      <TemplatesGallery />
    </Suspense>
  );
}
