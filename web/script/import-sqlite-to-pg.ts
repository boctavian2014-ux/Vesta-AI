/**
 * Import one-way: legacy SQLite (`data.db`) → PostgreSQL (`DATABASE_URL`).
 * Uses **sql.js** (WASM) so no native compiler is required on Windows/macOS/Linux.
 *
 * Prerequisites:
 * - Target Postgres already has Drizzle schema (run app once or migrations applied).
 * - Prefer an **empty** target DB; otherwise use `--force` (see README).
 *
 * Usage (from `web/`):
 *   DATABASE_URL=postgresql://... npm run import:sqlite-to-pg
 *   DATABASE_URL=... npm run import:sqlite-to-pg -- --sqlite=../data.db
 *   DATABASE_URL=... npm run import:sqlite-to-pg -- --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { Pool } from "pg";

type SqliteRow = Record<string, unknown>;

function parseArgs() {
  const argv = process.argv.slice(2);
  let sqlitePath = path.resolve(process.cwd(), "data.db");
  let dryRun = false;
  let force = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a.startsWith("--sqlite=")) sqlitePath = path.resolve(process.cwd(), a.slice("--sqlite=".length));
  }
  return { sqlitePath, dryRun, force };
}

function coerceTimestamptz(v: unknown): string {
  if (v == null || v === "") return new Date().toISOString();
  const s = String(v).trim();
  if (s.toLowerCase() === "now") return new Date().toISOString();
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return new Date().toISOString();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function sqliteAll(db: SqlJsDatabase, sql: string): SqliteRow[] {
  try {
    const stmt = db.prepare(sql);
    const rows: SqliteRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as SqliteRow);
    }
    stmt.free();
    return rows;
  } catch {
    return [];
  }
}

async function openSqlite(sqlitePath: string): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const buf = fs.readFileSync(sqlitePath);
  return new SQL.Database(buf);
}

async function main() {
  const { sqlitePath, dryRun, force } = parseArgs();
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = await openSqlite(sqlitePath);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const uc = await pool.query<{ c: number }>(`select count(*)::int as c from users`);
    const rc = await pool.query<{ c: number }>(`select count(*)::int as c from reports`);
    const hasData = (uc.rows[0]?.c ?? 0) > 0 || (rc.rows[0]?.c ?? 0) > 0;

    if (hasData && !force) {
      console.error(
        "[import] Target PostgreSQL already has rows in users or reports. Use empty DB or pass --force (may hit UNIQUE errors)."
      );
      process.exit(1);
    }

    const users = sqliteAll(sqlite, `select * from users`);
    const saved = sqliteAll(sqlite, `select * from saved_properties`);
    const reps = sqliteAll(sqlite, `select * from reports`);
    const events = sqliteAll(sqlite, `select * from report_status_events`);

    console.log(
      `[import] SQLite: users=${users.length} saved_properties=${saved.length} reports=${reps.length} report_status_events=${events.length} dryRun=${dryRun}`
    );

    if (dryRun) {
      console.log("[import] Dry run — no writes.");
      process.exit(0);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const row of users) {
        await client.query(
          `insert into users (id, username, password, email, created_at)
           values ($1,$2,$3,$4,$5::timestamptz)
           on conflict (id) do nothing`,
          [
            Number(row.id),
            String(row.username),
            String(row.password),
            String(row.email),
            coerceTimestamptz(row.created_at),
          ]
        );
      }

      for (const row of saved) {
        await client.query(
          `insert into saved_properties (
            id, user_id, referencia_catastral, address, lat, lon,
            price_per_sqm, avg_rent_per_sqm, gross_yield, net_yield, roi, opportunity_score, saved_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz
          ) on conflict (id) do nothing`,
          [
            Number(row.id),
            Number(row.user_id),
            str(row.referencia_catastral),
            str(row.address),
            str(row.lat),
            str(row.lon),
            str(row.price_per_sqm),
            str(row.avg_rent_per_sqm),
            str(row.gross_yield),
            str(row.net_yield),
            str(row.roi),
            str(row.opportunity_score),
            coerceTimestamptz(row.saved_at),
          ]
        );
      }

      for (const row of reps) {
        await client.query(
          `insert into reports (
            id, user_id, property_id, type, status, stripe_session_id, stripe_job_id, pdf_url,
            referencia_catastral, address, cadastral_json, financial_json, nota_simple_json, report_json,
            provider_name, provider_order_id, provider_status, provider_raw_json,
            requested_at, completed_at, map_lat, map_lon, created_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::timestamptz
          ) on conflict (id) do nothing`,
          [
            Number(row.id),
            Number(row.user_id),
            intOrNull(row.property_id),
            String(row.type),
            str(row.status) ?? "pending",
            str(row.stripe_session_id),
            str(row.stripe_job_id),
            str(row.pdf_url),
            str(row.referencia_catastral),
            str(row.address),
            str(row.cadastral_json),
            str(row.financial_json),
            str(row.nota_simple_json),
            str(row.report_json),
            str(row.provider_name),
            str(row.provider_order_id),
            str(row.provider_status),
            str(row.provider_raw_json),
            str(row.requested_at),
            str(row.completed_at),
            str(row.map_lat),
            str(row.map_lon),
            coerceTimestamptz(row.created_at),
          ]
        );
      }

      for (const row of events) {
        await client.query(
          `insert into report_status_events (
            id, report_id, from_status, to_status, actor_user_id, actor_email, actor_name, note, created_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz
          ) on conflict (id) do nothing`,
          [
            Number(row.id),
            Number(row.report_id),
            str(row.from_status),
            String(row.to_status),
            intOrNull(row.actor_user_id),
            str(row.actor_email),
            str(row.actor_name),
            str(row.note),
            coerceTimestamptz(row.created_at),
          ]
        );
      }

      await client.query(
        `select setval(pg_get_serial_sequence('users','id'), coalesce((select max(id) from users), 1), true)`
      );
      await client.query(
        `select setval(pg_get_serial_sequence('saved_properties','id'), coalesce((select max(id) from saved_properties), 1), true)`
      );
      await client.query(
        `select setval(pg_get_serial_sequence('reports','id'), coalesce((select max(id) from reports), 1), true)`
      );
      await client.query(
        `select setval(pg_get_serial_sequence('report_status_events','id'), coalesce((select max(id) from report_status_events), 1), true)`
      );

      await client.query("COMMIT");
      console.log("[import] Done. Sequences aligned to max(id) per table.");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[import] Failed:", err);
  process.exit(1);
});
