import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

function requireDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[vesta-web] FATAL: DATABASE_URL is required in production (PostgreSQL).\n" +
          "Railway: add a PostgreSQL service → open THIS web service → Variables → + New Variable → " +
          "Reference Variable → choose Postgres → DATABASE_URL (or paste the connection string)."
      );
      process.exit(1);
    }
    throw new Error(
      "DATABASE_URL is not set. Example: postgresql://user:pass@127.0.0.1:5432/vesta_web"
    );
  }
  return url;
}

/** Parse host/db for logs and sanity checks (password never logged). */
function parseDatabaseUrlMeta(connectionString: string): { host: string; port: string; database: string } | null {
  try {
    let s = connectionString.trim();
    if (s.startsWith("postgres://")) {
      s = `postgresql://${s.slice("postgres://".length)}`;
    }
    const u = new URL(s);
    const database = decodeURIComponent((u.pathname || "/").replace(/^\//, "") || "(missing)");
    return {
      host: u.hostname || "(missing)",
      port: u.port || "5432",
      database,
    };
  } catch {
    return null;
  }
}

function assertDatabaseUrlLooksPlausible(url: string): void {
  const meta = parseDatabaseUrlMeta(url);
  if (!meta) {
    console.error("[vesta-web] FATAL: DATABASE_URL is not a valid PostgreSQL URL.");
    process.exit(1);
  }
  // Broken Railway/manual values sometimes end up as host "base" (truncated / wrong reference).
  if (meta.host === "base") {
    console.error(
      '[vesta-web] FATAL: DATABASE_URL hostname is "base" (invalid). Usually a bad Reference or truncated string.\n' +
        "Fix: Railway → vesta-web → Variables → delete DATABASE_URL → + Reference Variable → select your **PostgreSQL** service → DATABASE_URL.\n" +
        "Or paste the full URI from Postgres → **Connect** (private URL contains `*.railway.internal`)."
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.log(
      `[vesta-web] DATABASE_URL ok: host=${meta.host} port=${meta.port} database=${meta.database}`
    );
  }
}

/** Call once before routes/storage. Runs Drizzle migrations from ./migrations (cwd-relative). */
export async function initDatabase(): Promise<void> {
  const url = requireDatabaseUrl();
  assertDatabaseUrlLooksPlausible(url);
  pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 10) });
  db = drizzle(pool, { schema });
  const migrationsFolder = path.join(process.cwd(), "migrations");

  // Check whether all migrations have already been applied so we can skip
  // re-running them on subsequent deployments. Drizzle records applied
  // migrations in __drizzle_migrations; if every entry in the local journal
  // is already present there we have nothing to do.
  if (await areMigrationsAlreadyApplied(pool, migrationsFolder)) {
    console.log("[vesta-web] All migrations already applied — skipping migrate().");
    return;
  }

  try {
    await migrate(db, { migrationsFolder });
  } catch (e: unknown) {
    const err = e as { cause?: NodeJS.ErrnoException & { hostname?: string }; code?: string };
    const cause = err?.cause;
    const code = cause?.code ?? err?.code;
    const hostname = cause?.hostname;
    if (code === "ENOTFOUND") {
      console.error(
        `[vesta-web] FATAL: cannot resolve PostgreSQL host (${code}${hostname ? `: "${hostname}"` : ""}). ` +
          "DATABASE_URL points at a hostname that does not exist in DNS. On Railway, re-add DATABASE_URL via **Reference** from the Postgres service, or paste the full private URL from Postgres → Connect."
      );
      process.exit(1);
    }
    // 42P07 — "relation already exists". The schema is already in place but
    // the migration journal was missing or out of sync. Treat this as a
    // non-fatal warning so the app can still start successfully.
    if (code === "42P07") {
      console.warn(
        "[vesta-web] WARNING: migration skipped — relation already exists (42P07). " +
          "The database schema appears to be up to date from a previous deployment."
      );
      return;
    }
    throw e;
  }
}

/**
 * Returns true when every migration tag listed in the local Drizzle journal
 * is already recorded in the __drizzle_migrations table, meaning there is
 * nothing new to apply.
 */
async function areMigrationsAlreadyApplied(
  pgPool: Pool,
  migrationsFolder: string
): Promise<boolean> {
  // Read the local journal to find out which migrations we expect.
  let journalEntries: Array<{ tag: string }> = [];
  try {
    const fs = await import("node:fs/promises");
    const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
    const raw = await fs.readFile(journalPath, "utf-8");
    const journal = JSON.parse(raw) as { entries?: Array<{ tag: string }> };
    journalEntries = journal.entries ?? [];
  } catch {
    // If we cannot read the journal we cannot make a determination — let
    // migrate() run normally and surface any real errors itself.
    return false;
  }

  if (journalEntries.length === 0) {
    return false;
  }

  const client = await pgPool.connect();
  try {
    // Check whether the Drizzle migrations tracking table exists at all.
    const tableCheck = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '__drizzle_migrations'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) {
      return false;
    }

    // Fetch every tag that has already been recorded.
    const applied = await client.query<{ tag: string }>(
      "SELECT tag FROM __drizzle_migrations"
    );
    const appliedTags = new Set(applied.rows.map((r) => r.tag));

    // All local journal entries must be present for us to skip migration.
    const journalComplete = journalEntries.every((entry) => appliedTags.has(entry.tag));
    if (!journalComplete) {
      return false;
    }

    // Guard against partial failures where the migration journal was written
    // but the actual schema creation did not complete (e.g. the "users" table
    // is missing even though __drizzle_migrations has an entry). In that case
    // we must run migrations again to finish building the schema.
    const usersTableCheck = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
      ) AS exists
    `);
    if (!usersTableCheck.rows[0]?.exists) {
      console.warn(
        "[vesta-web] WARNING: migration journal is complete but the 'users' table does not exist — " +
          "schema creation likely failed partway through. Re-running migrations."
      );
      return false;
    }

    return true;
  } catch {
    // Any unexpected error (e.g. permission denied) — fall through to the
    // normal migrate() path and let it handle things.
    return false;
  } finally {
    client.release();
  }
}

export function getPool(): Pool {
  if (!pool) throw new Error("initDatabase() has not been called");
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) throw new Error("initDatabase() has not been called");
  return db;
}

/** After HTTP server close — drains the pool (sessions + Drizzle). Safe to call once. */
export async function closeDatabase(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  db = null;
  await p.end();
}
