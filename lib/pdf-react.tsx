import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { AlignmentResult, MasterProfile } from "./schema";
import type { LayoutBlock } from "./pdf-layout";

/* Real, deterministic PDF generation with @react-pdf/renderer — one-click,
 * consistent on every machine, embedded standard fonts, selectable text in
 * proper reading order (ATS-friendly). Two modes:
 *   - "styled": mirrors the on-screen résumé (template look, or the uploaded
 *     résumé's positioned blocks).
 *   - "ats":    a clean single-column, plain-text flow optimised for parsers.
 */

export type PdfMode = "styled" | "ats";

const ACCENT = "#4338ca";
const INK = "#111827";
const MUTE = "#555555";

/* ---- font mapping ---- */
function serifFor(template?: string) {
  return template === "classic";
}
function uploadFont(fontFamily: string): "Helvetica" | "Times-Roman" | "Courier" {
  const n = (fontFamily || "").toLowerCase();
  if (/times|serif|georgia|garamond/.test(n)) return "Times-Roman";
  if (/courier|mono/.test(n)) return "Courier";
  return "Helvetica";
}

/* ================================================================== */
/*  Template résumé (structured)                                       */
/* ================================================================== */

function templateStyles(serif: boolean, plain: boolean) {
  const base = serif ? "Times-Roman" : "Helvetica";
  const accent = plain ? INK : ACCENT;
  return StyleSheet.create({
    page: { paddingVertical: 40, paddingHorizontal: 48, fontFamily: base, fontSize: 10, color: INK, lineHeight: 1.35 },
    header: { marginBottom: 12, textAlign: serif ? "center" : "left" },
    name: { fontSize: 20, fontFamily: base, fontWeight: "bold" },
    contact: { fontSize: 9, color: MUTE, marginTop: 3 },
    section: { marginBottom: 11 },
    heading: {
      fontSize: 10.5,
      fontWeight: "bold",
      color: accent,
      textTransform: "uppercase",
      letterSpacing: 1,
      borderBottomWidth: plain ? 0.5 : 1,
      borderBottomColor: plain ? "#999999" : accent,
      paddingBottom: 2,
      marginBottom: 5,
    },
    entry: { marginBottom: 6 },
    entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 1 },
    role: { fontSize: 10.5, fontWeight: "bold", flex: 1, paddingRight: 8 },
    date: { fontSize: 9, color: MUTE },
    summary: { fontSize: 9.8 },
    bulletRow: { flexDirection: "row", marginBottom: 1.5, paddingLeft: 2 },
    bulletDot: { width: 9, fontSize: 9.5 },
    bulletText: { flex: 1, fontSize: 9.6 },
    skills: { fontSize: 9.6 },
  });
}

function Bullets({ items, s }: { items: string[]; s: any }) {
  return (
    <View>
      {items.filter((t) => t.trim()).map((t, i) => (
        <View key={i} style={s.bulletRow} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function TemplateDoc({ profile, result, template, mode }: { profile: MasterProfile; result: AlignmentResult; template?: string; mode: PdfMode }) {
  const plain = mode === "ats";
  const serif = !plain && serifFor(template);
  const s = templateStyles(serif, plain);
  const c = profile.contact;
  const contactBits = [c.email, c.phone, c.location, ...c.links].filter(Boolean).join("   •   ");
  const order = profile.section_order?.length ? profile.section_order : ["summary", "experiences", "projects", "education", "skills"];
  const skills = result.verified_skills.length ? result.verified_skills : profile.skills;

  const renderSection = (key: string, idx: number) => {
    if (key === "summary" && result.tailored_summary.trim()) {
      return (
        <View key={idx} style={s.section}>
          <Text style={s.heading}>Summary</Text>
          <Text style={s.summary}>{result.tailored_summary}</Text>
        </View>
      );
    }
    if (key === "experiences" && result.experiences.length) {
      return (
        <View key={idx} style={s.section}>
          <Text style={s.heading}>Experience</Text>
          {result.experiences.map((e, i) => (
            <View key={i} style={s.entry} wrap={false}>
              <View style={s.entryHead}>
                <Text style={s.role}>{[e.role_title, e.company].filter(Boolean).join(" — ")}</Text>
                {e.date_range ? <Text style={s.date}>{e.date_range}</Text> : null}
              </View>
              <Bullets items={e.bullet_points.map((b) => b.tailored_text)} s={s} />
            </View>
          ))}
        </View>
      );
    }
    if (key === "projects" && result.projects.length) {
      return (
        <View key={idx} style={s.section}>
          <Text style={s.heading}>Projects</Text>
          {result.projects.map((p, i) => (
            <View key={i} style={s.entry} wrap={false}>
              <View style={s.entryHead}>
                <Text style={s.role}>{[p.role_title, p.name].filter(Boolean).join(" — ")}</Text>
                {p.date_range ? <Text style={s.date}>{p.date_range}</Text> : null}
              </View>
              <Bullets items={p.bullet_points.map((b) => b.tailored_text)} s={s} />
            </View>
          ))}
        </View>
      );
    }
    if (key === "education" && profile.education.length) {
      return (
        <View key={idx} style={s.section}>
          <Text style={s.heading}>Education</Text>
          {profile.education.map((e, i) => (
            <View key={i} style={s.entryHead} wrap={false}>
              <Text style={s.role}>{[e.institution, e.degree].filter(Boolean).join(" — ")}</Text>
              {e.date_range ? <Text style={s.date}>{e.date_range}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    if (key === "skills" && skills.length) {
      return (
        <View key={idx} style={s.section}>
          <Text style={s.heading}>Skills</Text>
          <Text style={s.skills}>{skills.join(", ")}</Text>
        </View>
      );
    }
    if (key.startsWith("custom:")) {
      const title = key.replace("custom:", "");
      const sec = result.custom_sections.find((x) => x.section_title === title);
      if (sec && sec.items.length) {
        return (
          <View key={idx} style={s.section}>
            <Text style={s.heading}>{sec.section_title}</Text>
            {sec.items.map((it, i) => (
              <View key={i} style={s.entry} wrap={false}>
                <View style={s.entryHead}>
                  <Text style={s.role}>{[it.role_title, it.name].filter(Boolean).join(" — ")}</Text>
                  {it.date_range ? <Text style={s.date}>{it.date_range}</Text> : null}
                </View>
                <Bullets items={it.bullet_points.map((b) => b.tailored_text)} s={s} />
              </View>
            ))}
          </View>
        );
      }
    }
    return null;
  };

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.name}>{c.name || "Your Name"}</Text>
          {contactBits ? <Text style={s.contact}>{contactBits}</Text> : null}
        </View>
        {order.map(renderSection)}
      </Page>
    </Document>
  );
}

/* ================================================================== */
/*  Uploaded résumé                                                    */
/* ================================================================== */

function UploadStyledDoc({ pages, blocks }: { pages: { width: number; height: number }[]; blocks: LayoutBlock[] }) {
  return (
    <Document>
      {pages.map((pg, pi) => (
        <Page key={pi} size={{ width: pg.width, height: pg.height }}>
          {blocks
            .filter((b) => b.page === pi)
            .map((b) => (
              <Text
                key={b.id}
                style={{
                  position: "absolute",
                  left: b.x,
                  top: b.y,
                  width: b.width + 2,
                  fontSize: b.fontSize,
                  fontFamily: uploadFont(b.fontFamily),
                  fontWeight: b.bold ? "bold" : "normal",
                  fontStyle: b.italic ? "italic" : "normal",
                  color: INK,
                  lineHeight: 1.15,
                }}
              >
                {(b.bullet || "") + b.text}
              </Text>
            ))}
        </Page>
      ))}
    </Document>
  );
}

function UploadAtsDoc({ blocks }: { blocks: LayoutBlock[] }) {
  const s = StyleSheet.create({
    page: { paddingVertical: 44, paddingHorizontal: 50, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.35 },
    name: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
    contact: { fontSize: 9, color: MUTE, textAlign: "center", marginTop: 3, marginBottom: 8 },
    heading: { fontSize: 10.5, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, borderBottomWidth: 0.5, borderBottomColor: "#999999", paddingBottom: 2, marginTop: 10, marginBottom: 4 },
    para: { fontSize: 9.8, marginBottom: 2 },
    bulletRow: { flexDirection: "row", marginBottom: 1.5, paddingLeft: 2 },
    dot: { width: 9, fontSize: 9.5 },
    btext: { flex: 1, fontSize: 9.6 },
  });
  const ordered = [...blocks].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {ordered.map((b) => {
          if (!b.text.trim() && b.kind !== "name") return null;
          if (b.kind === "name") return <Text key={b.id} style={s.name}>{b.text}</Text>;
          if (b.kind === "contact") return <Text key={b.id} style={s.contact}>{b.text}</Text>;
          if (b.kind === "heading") return <Text key={b.id} style={s.heading}>{b.text}</Text>;
          if (b.bullet)
            return (
              <View key={b.id} style={s.bulletRow} wrap={false}>
                <Text style={s.dot}>•</Text>
                <Text style={s.btext}>{b.text}</Text>
              </View>
            );
          return <Text key={b.id} style={s.para}>{b.text}</Text>;
        })}
      </Page>
    </Document>
  );
}

/* ================================================================== */
/*  Entry point                                                        */
/* ================================================================== */

export async function renderResumePdf(opts: {
  kind: "template" | "upload";
  mode: PdfMode;
  payload: any;
}): Promise<Buffer> {
  let doc: React.ReactElement;
  if (opts.kind === "template") {
    doc = <TemplateDoc profile={opts.payload.profile} result={opts.payload.result} template={opts.payload.template} mode={opts.mode} />;
  } else if (opts.mode === "ats") {
    doc = <UploadAtsDoc blocks={opts.payload.blocks || []} />;
  } else {
    doc = <UploadStyledDoc pages={opts.payload.pages || []} blocks={opts.payload.blocks || []} />;
  }
  return renderToBuffer(doc);
}
