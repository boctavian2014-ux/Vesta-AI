import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const manifestPath = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");

let key = "";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.substring(0, eq).trim();
    if (k !== "GOOGLE_MAPS_API_KEY") continue;
    let v = t.substring(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.substring(1, v.length - 1);
    }
    key = v;
    break;
  }
}

const manifest = fs.readFileSync(manifestPath, "utf8");
const hasMeta =
  manifest.includes("com.google.android.geo.API_KEY") &&
  manifest.includes("${GOOGLE_MAPS_API_KEY}");
const ok = key.length > 20 && key.startsWith("AIza");

const report = {
  envFileExists: fs.existsSync(envPath),
  manifestHasMapsMeta: hasMeta,
  keyLoaded: Boolean(key),
  keyFingerprint: key ? `${key.slice(0, 6)}…${key.slice(-4)} (len ${key.length})` : null,
  readyForGradleBuild: ok && hasMeta,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.readyForGradleBuild ? 0 : 1);
