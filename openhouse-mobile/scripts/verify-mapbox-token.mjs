/**
 * Verifies EXPO_PUBLIC_MAPBOX_TOKEN in .env: shape + live Mapbox API (Geocoding).
 * Does not print the full token.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

function parseEnvKey(contents, key) {
  for (const line of contents.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    if (k !== key) continue;
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v.trim();
  }
  return "";
}

if (!fs.existsSync(envPath)) {
  console.log(JSON.stringify({ ok: false, error: "Missing .env" }, null, 2));
  process.exit(1);
}

const token = parseEnvKey(fs.readFileSync(envPath, "utf8"), "EXPO_PUBLIC_MAPBOX_TOKEN");
const report = {
  envFile: envPath,
  keyPresent: Boolean(token),
  looksLikePublicToken: token.startsWith("pk."),
  length: token.length,
  fingerprint: token ? `${token.slice(0, 7)}…${token.slice(-4)}` : null,
  apiCheck: null,
};

if (!token) {
  report.ok = false;
  report.error = "EXPO_PUBLIC_MAPBOX_TOKEN missing or empty";
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

if (!token.startsWith("pk.")) {
  report.ok = false;
  report.error = "Mapbox public tokens usually start with pk.";
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/Madrid.json?access_token=${encodeURIComponent(token)}&limit=1`;
try {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let snippet = text.slice(0, 120).replace(/\s+/g, " ");
  if (text.length > 120) snippet += "…";
  report.apiCheck = {
    status: res.status,
    ok: res.ok,
    bodyPreview: res.ok ? "(JSON features present)" : snippet,
  };
  report.ok = res.ok;
  if (!res.ok) {
    report.error = `Mapbox API returned ${res.status} — token may be invalid, revoked, or missing scopes`;
  }
} catch (e) {
  report.ok = false;
  report.apiCheck = { error: e instanceof Error ? e.message : String(e) };
  report.error = "Network error calling Mapbox";
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
