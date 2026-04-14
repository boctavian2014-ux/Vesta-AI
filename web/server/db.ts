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
      console.error("[vesta-web] FATAL: DATABASE_URL is required in production (PostgreSQL).");
      process.exit(1);
    }
    throw new Error(
      "DATABASE_URL is not set. Example: postgresql://user:pass@127.0.0.1:5432/vesta_web"
    );
  }
  return url;
}

/** Call once before routes/storage. Runs Drizzle migrations from ./migrations (cwd-relative). */
export async function initDatabase(): Promise<void> {
  const url = requireDatabaseUrl();
  pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 10) });
  db = drizzle(pool, { schema });
  const migrationsFolder = path.join(process.cwd(), "migrations");
  await migrate(db, { migrationsFolder });
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
