const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Optional env override for express-rate-limit `max` (requests per window).
 * Missing or invalid → prodDefault in production, devDefault in development.
 * Capped to avoid accidental huge values.
 */
export function envRateLimitMax(envKey: string, prodDefault: number, devDefault: number): number {
  const raw = (process.env[envKey] || "").trim();
  if (!raw) return IS_PROD ? prodDefault : devDefault;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return IS_PROD ? prodDefault : devDefault;
  return Math.min(n, 250_000);
}
