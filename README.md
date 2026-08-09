# Slay.res

**Slay the ATS. Zero Hallucinations.**

A deterministic, context-aware resume engineering app. Unlike standard AI resume
builders that invent fake metrics and tools, Slay.res acts as a strict translator
and semantic alignment engine: it rephrases and reorders **only your true
experience** to fit a target Job Description, and every generated bullet is
traceable to a real source ID.

## The flow

1. **Your Details** — enter your resume by hand (contact, summary, experiences
   with bullets, education, skills). Every bullet gets a stable unique id and is
   preserved verbatim when tailoring — this is your source of truth.
2. **Upload & Reconcile** *(optional)* — upload an existing resume PDF/text. We
   extract it, diff it against your details, and let you pick which extracted
   items (contact fields, roles, education, skills) to merge in. The uploaded
   PDF is kept for the side-by-side.
3. **Target JD Alignment** — paste the job description. The AI rewrites your
   real experience to the JD's terminology and reorders by relevance. A semantic
   **gap analysis** splits requirements into 🟢 matched, 🔴 missing (listed,
   never faked), and 🟡 rephrased. Every tailored bullet maps back to a source
   id; a **Proof of Truth** badge shows 100% traceability.
4. **Preview, Template & Download** — original (your uploaded PDF *or* your
   details) on the left, tailored resume on the right, in one of four templates
   (Modern / Classic / Minimal / Compact). **Download** outputs *only* the
   resume as a clean, printable PDF. Copy as Markdown or LaTeX too.

**Zero hallucination:** the server runs `verifyTraceability()` on every result —
any bullet whose id isn't in your profile is dropped, and any bullet that
introduces a number not in the source is reverted to your original text.

## Stack

- **Next.js 14** (App Router), React 18, Tailwind CSS, Framer Motion, Lucide icons
- **API routes** with Zod-validated schemas
- **Google Gemini** (primary) / **Anthropic Claude** (optional) with JSON-schema
  structured outputs

## The engines

Slay.res works with **zero configuration**. Engine selection — first available wins:

1. **Gemini engine.** Set `GEMINI_API_KEY` and Slay.res uses `gemini-2.5-flash`
   under a strict system prompt + JSON-schema structured output.
2. **Claude engine.** Set `ANTHROPIC_API_KEY` (and no Gemini key) to use
   `claude-opus-5` instead.
3. **Deterministic engine (default).** A curated skill lexicon + keyword scoring
   aligns your real bullets to the JD entirely offline — no API key, no external
   calls, no hallucinations. Same input always yields the same output.

The LLM paths silently fall back to the deterministic engine on any failure.

**Either way**, the server runs `verifyTraceability()` on the result: any tailored
bullet whose id doesn't exist in the profile is dropped, and any bullet that
introduces a fabricated number is reverted to the true source text. The
zero-hallucination guarantee holds regardless of engine.

## Sign in & local database (optional)

Sign in with **Google** to auto-save your details to a local **SQLite** file
(`slay.db`) and reload them next time. Signed out, the app works fully
in-memory — nothing is stored.

- Storage: `better-sqlite3` → `slay.db` at the project root (`users` +
  `profiles` tables), read/written via `/api/profile` (gated by the session).
- Auth: NextAuth (Google provider). Auto-save is debounced; the header shows a
  "Saving… / Saved" indicator and your Google avatar.

To enable Google sign-in, set these in `.env` (the app runs without them):

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
```

In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
create an **OAuth client ID → Web application** and add the redirect URI
`http://localhost:3000/api/auth/callback/google`.

## Getting started

```bash
npm install
cp .env.example .env   # optional — add ANTHROPIC_API_KEY for the Claude engine
npm run dev
```

Open http://localhost:3000 and click **Load demo** to try it instantly.

## Project layout

```
app/
  layout.tsx            root layout, ambient orbs, metadata
  page.tsx              the 4-step light glass dashboard (client)
  globals.css           liquid-glass theme, print styles (resume-only)
  api/parse/route.ts    PDF/text → structured profile (for reconcile)
  api/analyze/route.ts  profile + JD → tailored alignment + proof
components/
  ResumeDoc.tsx         resume renderer + 4 templates
lib/
  schema.ts             Zod schemas, JSON schema, strict system prompt
  profile.ts            details helpers: build/edit/reconcile/merge
  keywords.ts           skill lexicon + keyword extraction
  parse.ts              deterministic resume-text parser
  engine.ts             deterministic aligner + traceability verifier
  gemini.ts             Gemini alignment path (primary)
  claude.ts             optional Claude alignment path
  export.ts             Markdown + LaTeX builders
  sample.ts             demo JD
```

## Strict AI contract

The API route enforces this JSON schema (`lib/schema.ts`) and system prompt on
the Gemini and Claude paths — and the deterministic engine produces the identical
shape:

```
tailored_summary            string
experiences[]               { source_experience_id, company, role_title,
                              date_range, bullet_points[] }
  bullet_points[]           { source_bullet_id, tailored_text,
                              highlighted_keywords[] }
verified_skills[]           string          (present in profile AND JD)
unmatched_requirements[]    { skill_or_requirement, recommendation }
```

> "You MUST ONLY use facts present in the Candidate's Master Experience data.
> NEVER invent metrics, companies, titles, or tools. If a JD skill is missing,
> DO NOT invent it — add it to `unmatched_requirements`. Every generated bullet
> MUST reference an existing `source_bullet_id`."
