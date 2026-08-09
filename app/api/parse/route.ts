import { NextRequest, NextResponse } from "next/server";
import { parseResumeText } from "@/lib/parse";
import { parseResumeWithGemini, geminiAvailable } from "@/lib/gemini";
import { MasterProfileSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 1 — Ingestion. Accepts either:
 *   - multipart/form-data with a `file` (PDF), or
 *   - application/json with `{ text: "<pasted resume>" }`.
 * Returns a structured MasterProfile with a stable id on every bullet.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let rawText = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      }
      const blob = file as File;
      if (!/pdf$/i.test(blob.type) && !/\.pdf$/i.test(blob.name)) {
        return NextResponse.json({ error: "Only PDF files are supported. Use paste-text mode for other formats." }, { status: 400 });
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      rawText = await extractPdfText(buffer);
    } else {
      const body = await req.json().catch(() => ({}));
      rawText = typeof body?.text === "string" ? body.text : "";
    }

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not read any resume text. The PDF may be image-only (scanned) — paste the text instead." },
        { status: 422 }
      );
    }

    // Prefer AI extraction — the regex parser can't handle many real-world
    // formats (projects as "Name: paragraph", "Cert | Issuer" lines,
    // comma-separated competencies). Fall back to the heuristic parser on
    // failure so parsing always succeeds.
    let profile;
    if (geminiAvailable()) {
      try {
        profile = await parseResumeWithGemini(rawText);
      } catch (e) {
        console.error("[parse] Gemini parse failed, using heuristic parser:", e);
        profile = MasterProfileSchema.parse(parseResumeText(rawText));
      }
    } else {
      profile = MasterProfileSchema.parse(parseResumeText(rawText));
    }
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parsing error.";
    return NextResponse.json({ error: `Failed to parse resume: ${message}` }, { status: 500 });
  }
}

import { spawn } from "child_process";

async function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-e",
      `
      const pdfParse = require("pdf-parse");
      const chunks = [];
      process.stdin.on("data", c => chunks.push(c));
      process.stdin.on("end", () => {
        function render_page(pageData) {
          return pageData.getTextContent().then(function(textContent) {
            let lastY, text = '';
            // Sort items by Y (descending), then X (ascending) to preserve multi-column flow
            textContent.items.sort((a, b) => {
              if (Math.abs(b.transform[5] - a.transform[5]) > 2) {
                return b.transform[5] - a.transform[5];
              }
              return a.transform[4] - b.transform[4];
            });
            for (let item of textContent.items) {
              if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 2) {
                text += '\\n';
              }
              text += item.str + " ";
              lastY = item.transform[5];
            }
            return text;
          });
        }
        pdfParse(Buffer.concat(chunks), { pagerender: render_page }).then(data => {
          process.stdout.write(data.text || "");
          process.exit(0);
        }).catch(err => {
          console.error(err);
          process.exit(1);
        });
      });
      `
    ], { cwd: process.cwd() });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("PDF parsing failed: " + errorOutput));
      } else {
        resolve(output);
      }
    });

    child.stdin.write(buffer);
    child.stdin.end();
  });
}
