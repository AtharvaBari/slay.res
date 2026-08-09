import { AlignmentResult, MasterProfile } from "./schema";

/** Build clean, ATS-friendly Markdown from the tailored result. */
export function toMarkdown(profile: MasterProfile, result: AlignmentResult): string {
  const c = profile.contact;
  const lines: string[] = [];

  if (c.name) lines.push(`# ${c.name}`);
  const contactBits = [c.email, c.phone, c.location, ...c.links].filter(Boolean);
  if (contactBits.length) lines.push(contactBits.join(" · "));
  lines.push("");

  if (result.tailored_summary) {
    lines.push("## Summary", result.tailored_summary, "");
  }

  if (result.experiences.length) {
    lines.push("## Experience", "");
    for (const exp of result.experiences) {
      const header = [exp.role_title, exp.company].filter(Boolean).join(" — ");
      lines.push(`### ${header}${exp.date_range ? `  \n*${exp.date_range}*` : ""}`);
      for (const b of exp.bullet_points) lines.push(`- ${b.tailored_text}`);
      lines.push("");
    }
  }

  if (profile.education.length) {
    lines.push("## Education", "");
    for (const e of profile.education) {
      lines.push(`- **${e.institution}**${e.degree ? ` — ${e.degree}` : ""}${e.date_range ? ` (${e.date_range})` : ""}`);
    }
    lines.push("");
  }

  if (result.verified_skills.length) {
    lines.push("## Skills", result.verified_skills.join(", "), "");
  }

  return lines.join("\n").trim() + "\n";
}

const tex = (s: string) =>
  s.replace(/([\\{}&%$#_^~])/g, (m) => {
    const map: Record<string, string> = {
      "\\": "\\textbackslash{}",
      "{": "\\{",
      "}": "\\}",
      "&": "\\&",
      "%": "\\%",
      "$": "\\$",
      "#": "\\#",
      "_": "\\_",
      "^": "\\textasciicircum{}",
      "~": "\\textasciitilde{}",
    };
    return map[m] ?? m;
  });

/** Build a compact, self-contained LaTeX resume (article class, no exotic deps). */
export function toLatex(profile: MasterProfile, result: AlignmentResult): string {
  const c = profile.contact;
  const tc = profile.template_config ?? { fontPairing: "modern", lineSpacing: "normal", primaryColor: "#000000" };
  
  const out: string[] = [];
  out.push("\\documentclass[11pt,a4paper]{article}");
  out.push("\\usepackage[margin=0.75in]{geometry}");
  out.push("\\usepackage{enumitem}");
  out.push("\\usepackage[hidelinks]{hyperref}");
  out.push("\\usepackage{xcolor}");
  
  // Font pairing mapping
  if (tc.fontPairing === "modern") {
    out.push("\\usepackage[default]{lato}");
    out.push("\\usepackage[T1]{fontenc}");
  } else if (tc.fontPairing === "classic") {
    out.push("\\usepackage{charter}");
    out.push("\\usepackage[T1]{fontenc}");
  } else if (tc.fontPairing === "minimalist") {
    out.push("\\renewcommand{\\familydefault}{\\sfdefault}");
    out.push("\\usepackage{helvet}");
  }

  // Line spacing mapping
  if (tc.lineSpacing === "compact") out.push("\\renewcommand{\\baselinestretch}{0.95}");
  else if (tc.lineSpacing === "relaxed") out.push("\\renewcommand{\\baselinestretch}{1.15}");
  else out.push("\\renewcommand{\\baselinestretch}{1.03}"); // normal

  // Primary Color
  out.push(`\\definecolor{primary}{HTML}{${tc.primaryColor.replace("#", "")}}`);

  out.push("\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt}");
  out.push("\\pagestyle{empty}");
  out.push("\\begin{document}");

  if (c.name) out.push(`\\begin{center}{\\LARGE \\textcolor{primary}{\\textbf{${tex(c.name)}}}}\\\\[4pt]`);
  const bits = [c.email, c.phone, c.location, ...c.links].filter(Boolean).map(tex);
  if (bits.length) out.push(`{\\small ${bits.join(" $\\cdot$ ")}}`);
  if (c.name) out.push("\\end{center}");
  out.push("\\vspace{6pt}");

  const section = (title: string) =>
    out.push(`\\vspace{4pt}\\noindent{\\large \\textcolor{primary}{\\textbf{${tex(title)}}}}\\\\[-6pt]\\textcolor{primary}{\\rule{\\linewidth}{0.4pt}}\\\\[4pt]`);

  if (result.tailored_summary) {
    section("Summary");
    out.push(`${tex(result.tailored_summary)}\\\\[4pt]`);
  }

  if (result.experiences.length) {
    section("Experience");
    for (const exp of result.experiences) {
      const head = [exp.role_title, exp.company].filter(Boolean).map(tex).join(" --- ");
      out.push(`\\noindent\\textbf{${head}} \\hfill {\\small ${tex(exp.date_range)}}`);
      out.push("\\begin{itemize}");
      for (const b of exp.bullet_points) out.push(`  \\item ${tex(b.tailored_text)}`);
      out.push("\\end{itemize}");
    }
  }

  if (profile.education.length) {
    section("Education");
    out.push("\\begin{itemize}");
    for (const e of profile.education) {
      const line = [e.institution, e.degree].filter(Boolean).map(tex).join(" --- ");
      out.push(`  \\item ${line} \\hfill {\\small ${tex(e.date_range)}}`);
    }
    out.push("\\end{itemize}");
  }

  if (result.verified_skills.length) {
    section("Skills");
    out.push(tex(result.verified_skills.join(", ")));
  }

  out.push("\\end{document}");
  return out.join("\n");
}
