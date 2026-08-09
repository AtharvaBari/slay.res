import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import type { MasterProfile } from "./schema";
import type { JobStatus, JobMeta } from "./job";

export type { JobStatus, JobMeta } from "./job";

/* Local SQLite store. A single slay.db file at the project root holds users
 * (from Google sign-in) and one auto-saved profile per user. The connection is
 * cached on globalThis so Next.js dev HMR doesn't reopen it on every reload. */

type DB = Database.Database;

declare global {
  // eslint-disable-next-line no-var
  var __slayDb: DB | undefined;
}

function init(db: DB) {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -20000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email      TEXT PRIMARY KEY,
      name       TEXT,
      image      TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      email        TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      jd           TEXT,
      template     TEXT,
      updated_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      email       TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resumes (
      id           TEXT PRIMARY KEY,
      email        TEXT NOT NULL,
      title        TEXT NOT NULL,
      kind         TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes(email, updated_at DESC);
  `);

  // Migrations for tables that predate a column.
  addColumn(db, "resumes", "job_json", "TEXT NOT NULL DEFAULT '{}'");
}

/** Add a column if it doesn't already exist (idempotent lightweight migration). */
function addColumn(db: DB, table: string, col: string, def: string) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

export function getDb(): DB {
  if (!global.__slayDb) {
    const file = process.env.SLAY_DB_PATH || path.join(process.cwd(), "slay.db");
    const db = new Database(file);
    init(db);
    global.__slayDb = db;

    const closeDb = () => {
      if (global.__slayDb) {
        global.__slayDb.close();
        global.__slayDb = undefined;
      }
    };
    process.on("exit", closeDb);
    process.on("SIGINT", () => { closeDb(); process.exit(0); });
    process.on("SIGTERM", () => { closeDb(); process.exit(0); });
  }
  return global.__slayDb;
}

export function upsertUser(u: { email: string; name?: string; image?: string }) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO users (email, name, image, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, image = excluded.image`
    ).run(u.email, u.name ?? "", u.image ?? "", Date.now());
  })();
}

export interface SavedProfile {
  profile: MasterProfile;
  jd: string;
  template: string;
  updatedAt: number;
}

export function getProfile(email: string): SavedProfile | null {
  const row = getDb()
    .prepare(`SELECT profile_json, jd, template, updated_at FROM profiles WHERE email = ?`)
    .get(email) as
    | { profile_json: string; jd: string | null; template: string | null; updated_at: number }
    | undefined;
  if (!row) return null;
  try {
    return {
      profile: JSON.parse(row.profile_json) as MasterProfile,
      jd: row.jd ?? "",
      template: row.template ?? "modern",
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export function saveProfile(email: string, data: { profile: MasterProfile; jd?: string; template?: string }) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO profiles (email, profile_json, jd, template, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         profile_json = excluded.profile_json,
         jd = excluded.jd,
         template = excluded.template,
         updated_at = excluded.updated_at`
    ).run(email, JSON.stringify(data.profile), data.jd ?? "", data.template ?? "modern", Date.now());
  })();
}

/* ------------------------------------------------------------------ *
 *  Last generated result (per user). Holds either a template-based
 *  result (from profile details) or a faithful upload reconstruction,
 *  so the Results page survives a reload. Only the latest is kept.
 * ------------------------------------------------------------------ */

export type ResultKind = "template" | "upload";

export interface SavedResult {
  kind: ResultKind;
  payload: unknown;
  updatedAt: number;
}

export function saveResult(email: string, data: { kind: ResultKind; payload: unknown }) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO results (email, kind, payload_json, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         kind = excluded.kind,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(email, data.kind, JSON.stringify(data.payload), Date.now());
  })();
}

export function getResult(email: string): SavedResult | null {
  const row = getDb()
    .prepare(`SELECT kind, payload_json, updated_at FROM results WHERE email = ?`)
    .get(email) as { kind: string; payload_json: string; updated_at: number } | undefined;
  if (!row) return null;
  try {
    return {
      kind: row.kind as ResultKind,
      payload: JSON.parse(row.payload_json),
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 *  Resume library — multiple saved resumes per user, each editable and
 *  persisted. `kind` is "template" | "upload"; `payload` is the same
 *  shape the Results page renders.
 * ------------------------------------------------------------------ */

export interface ResumeRow {
  id: string;
  title: string;
  kind: ResultKind;
  payload: unknown;
  job: JobMeta;
  createdAt: number;
  updatedAt: number;
}
export interface ResumeMeta {
  id: string;
  title: string;
  kind: ResultKind;
  job: JobMeta;
  createdAt: number;
  updatedAt: number;
}

function parseJob(json: string | null): JobMeta {
  try {
    const j = JSON.parse(json || "{}");
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export function createResume(email: string, data: { title: string; kind: ResultKind; payload: unknown; job?: JobMeta }): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO resumes (id, email, title, kind, payload_json, job_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, data.title || "Untitled resume", data.kind, JSON.stringify(data.payload), JSON.stringify(data.job || {}), now, now);
  return id;
}

export function getResume(email: string, id: string): ResumeRow | null {
  const row = getDb()
    .prepare(`SELECT id, title, kind, payload_json, job_json, created_at, updated_at FROM resumes WHERE id = ? AND email = ?`)
    .get(id, email) as
    | { id: string; title: string; kind: string; payload_json: string; job_json: string; created_at: number; updated_at: number }
    | undefined;
  if (!row) return null;
  try {
    return {
      id: row.id,
      title: row.title,
      kind: row.kind as ResultKind,
      payload: JSON.parse(row.payload_json),
      job: parseJob(row.job_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export function listResumes(email: string): ResumeMeta[] {
  const rows = getDb()
    .prepare(`SELECT id, title, kind, job_json, created_at, updated_at FROM resumes WHERE email = ? ORDER BY updated_at DESC`)
    .all(email) as { id: string; title: string; kind: string; job_json: string; created_at: number; updated_at: number }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind as ResultKind,
    job: parseJob(r.job_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function latestResume(email: string): ResumeRow | null {
  const row = getDb()
    .prepare(`SELECT id FROM resumes WHERE email = ? ORDER BY updated_at DESC LIMIT 1`)
    .get(email) as { id: string } | undefined;
  return row ? getResume(email, row.id) : null;
}

/** Update a resume's title, payload, and/or job metadata. Returns true if updated. */
export function updateResume(email: string, id: string, patch: { title?: string; payload?: unknown; job?: JobMeta }): boolean {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof patch.title === "string") {
    sets.push("title = ?");
    vals.push(patch.title);
  }
  if (patch.payload !== undefined) {
    sets.push("payload_json = ?");
    vals.push(JSON.stringify(patch.payload));
  }
  if (patch.job !== undefined) {
    sets.push("job_json = ?");
    vals.push(JSON.stringify(patch.job || {}));
  }
  if (!sets.length) return false;
  sets.push("updated_at = ?");
  vals.push(Date.now());
  const info = db.prepare(`UPDATE resumes SET ${sets.join(", ")} WHERE id = ? AND email = ?`).run(...(vals as any[]), id, email);
  return info.changes > 0;
}

export function deleteResume(email: string, id: string): void {
  getDb().prepare(`DELETE FROM resumes WHERE id = ? AND email = ?`).run(id, email);
}
