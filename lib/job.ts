/* Job-application metadata shared by the DB layer and the client UI.
 * Kept dependency-free so it can be imported from client components. */

export type JobStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface JobMeta {
  company?: string;
  role?: string;
  status?: JobStatus;
  url?: string;
  notes?: string;
  appliedAt?: number;
}

export const JOB_STATUSES: { id: JobStatus; label: string; badge: string; dot: string }[] = [
  { id: "saved", label: "Saved", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  { id: "applied", label: "Applied", badge: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { id: "interview", label: "Interview", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  { id: "offer", label: "Offer", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { id: "rejected", label: "Rejected", badge: "bg-rose-100 text-rose-600", dot: "bg-rose-400" },
];

export function statusMeta(status?: JobStatus) {
  return JOB_STATUSES.find((s) => s.id === status) || JOB_STATUSES[0];
}
