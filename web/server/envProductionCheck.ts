/**
 * Production-only startup diagnostics: warns about missing optional integrations,
 * optional fatal exit when VESTA_STRICT_STARTUP is set but Python API URL is missing.
 *
 * Hard requirements (DATABASE_URL, SESSION_SECRET in prod) are enforced elsewhere
 * (db.ts, routes.ts). See docs/PRODUCTION_CHECKLIST.md.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function truthyEnv(name: string): boolean {
  return ["1", "true", "yes"].includes((process.env[name] || "").trim().toLowerCase());
}

function isBlank(name: string): boolean {
  return !(process.env[name] || "").trim();
}

export function runProductionStartupChecks(): void {
  if (!IS_PRODUCTION) return;

  const warnings: string[] = [];

  if (isBlank("VEST_PYTHON_API_URL")) {
    warnings.push(
      "VEST_PYTHON_API_URL is unset — /api/property/*, payment proxy, async reports will return 503 until configured.",
    );
  }

  if (truthyEnv("VESTA_STRICT_STARTUP") && isBlank("VEST_PYTHON_API_URL")) {
    console.error(
      "[vesta-web] FATAL: VESTA_STRICT_STARTUP is enabled but VEST_PYTHON_API_URL is empty. " +
        "Set the Python API base URL or unset VESTA_STRICT_STARTUP.",
    );
    process.exit(1);
  }

  if (isBlank("OPENAI_API_KEY")) {
    warnings.push("OPENAI_API_KEY is unset — POST /api/spain-property-search/chat will return 503.");
  }

  if (isBlank("TAVILY_API_KEY")) {
    warnings.push("TAVILY_API_KEY is unset — property search tool listings may be degraded (see README).");
  }

  if (isBlank("SMTP_HOST")) {
    warnings.push("SMTP_HOST is unset — outbound email notifications are disabled (console only).");
  }

  const matilKey = !isBlank("MATIL_API_KEY");
  const matilDeploy = !isBlank("MATIL_DEPLOYMENT_ID");
  if (matilKey !== matilDeploy) {
    warnings.push(
      "Matil: set both MATIL_API_KEY and MATIL_DEPLOYMENT_ID for partner Nota Simple async, or leave both empty.",
    );
  }

  const adminRaw = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "").trim();
  if (!adminRaw) {
    warnings.push("ADMIN_EMAILS / ADMIN_EMAIL is unset — no users will have admin flag from env.");
  }

  for (const line of warnings) {
    console.warn(`[vesta-web] STARTUP WARN: ${line}`);
  }

  if (warnings.length === 0) {
    console.log("[vesta-web] Production startup checks: no optional-env warnings.");
  }
}
