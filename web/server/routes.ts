import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import multer from "multer";
import * as nodemailer from "nodemailer";
import { registerSchema, loginSchema, type Report } from "@shared/schema";
import {
  buildFinancialAnalysisUpstreamBody,
  normalizeFinancialAnalysisForClient,
} from "./financialPayload";
import { buildZoneAnalysisPayload, resolveZoneLocale } from "./zoneAnalysisBuild";
import { fetchOsmNearbyEssentials } from "./zoneAnalysisOsm";
import {
  getWebhookSignatureHeaderName,
  getNotaProviderAdapter,
  mapWebhookStatusToInternal,
  normalizeWebhookPayload,
  verifyWebhookSignature,
} from "./notaProvider";
import {
  handleSpainPropertySearchChat,
  handleSpainPropertySearchStatus,
} from "./spainPropertySearchChat";
import { hashPasswordPlain, verifyPasswordWithUpgrade } from "./passwordAuth";
import { getPool } from "./db";

const PgSession = connectPgSimple(session);
const DEFAULT_SESSION_SECRET = "vesta-ai-secret-key-2026";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
);

// FastAPI origin for server-side proxy. Production: set VEST_PYTHON_API_URL on the web service (Python Railway URL, not the SPA domain).
function resolvePythonApiBase(): string {
  const fromEnv = (process.env.VEST_PYTHON_API_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[Vesta] VEST_PYTHON_API_URL is unset — /api/* proxy routes that need Python will return 503."
    );
    return "";
  }
  return "http://127.0.0.1:8000";
}

const PYTHON_API_BASE = resolvePythonApiBase();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function defaultSpaOrigin(): string {
  return (process.env.VESTA_WEB_BASE_URL || "https://vesta-asset.com").trim().replace(/\/$/, "");
}

/** 500 JSON: omit internal `error` string in production (still logged here). */
function jsonServerError(message: string, err: unknown) {
  console.error(`[vesta-web] ${message}`, err);
  if (IS_PRODUCTION) {
    return { message };
  }
  const detail = err instanceof Error ? err.message : String(err);
  return { message, error: detail };
}

const LEGACY_RO_TO_EN_REPLACEMENTS: Array<[string, string]> = [
  [
    "Demo: analiza de oportunitate indica un profil de risc mediu, cu potential de randament stabil pentru inchiriere pe termen lung.",
    "Demo: the opportunity analysis indicates a medium-risk profile, with stable long-term rental yield potential.",
  ],
  ["Dependenta de dinamica chiriei in micro-zona", "Dependence on micro-area rental dynamics"],
  ["Lichiditate medie la revanzare", "Medium resale liquidity"],
  ["Necesita buget minim de renovare pentru optimizare", "Requires a minimum renovation budget for optimization"],
  [
    "Nu sunt semnale majore de neconformitate urbanistica in setul demo.",
    "No major signs of urban planning non-compliance were identified in the demo data.",
  ],
  ["Cerere buna la inchiriere", "Strong rental demand"],
  ["Servicii urbane aproape", "Nearby urban services"],
  ["Conectivitate buna", "Good connectivity"],
  ["Competitie crescuta pe segmentul similar", "Higher competition in similar segment"],
  [
    "Demo: pachet expert cu focus pe due diligence juridic si riscul investitional al activului.",
    "Demo: expert package focused on legal due diligence and investment risk for the asset.",
  ],
  ["Sarcina activa necesita verificare notariala", "Active encumbrance requires notarial verification"],
  ["Necesita confirmare asupra istoricului de inscrieri", "Requires confirmation of registration history"],
  [
    "Exista elemente care necesita validare juridica suplimentara inainte de semnare.",
    "There are elements that require additional legal validation before signing.",
  ],
  ["Ipoteca activa inscrisa (demo)", "Registered active mortgage (demo)"],
  ["Posibila limitare administrativa (demo)", "Possible administrative limitation (demo)"],
  ["Verificare manuala recomandata pentru anexe", "Manual verification recommended for annexes"],
  [
    "Concordanta buna intre datele cadastrale si configuratia observata (demo).",
    "Good consistency between cadastral data and observed configuration (demo).",
  ],
  ["Zona cautata de chiriasi", "Area sought by tenants"],
  ["Acces bun la transport", "Good transport access"],
  ["Potential de apreciere", "Appreciation potential"],
  ["Sensibilitate la variatia dobanzilor", "Sensitive to interest rate variation"],
  ["Posibila ipoteca activa (demo).", "Possible active mortgage (demo)."],
  [
    "Necesita verificare registru pentru date exacte.",
    "Registry verification needed for exact dates.",
  ],
  ["Necesita confirmare la zi la Registru.", "Requires up-to-date confirmation at the Land Registry."],
  [
    "Sarcina activa necesita confirmare registrala finala",
    "Active encumbrance requires final registry confirmation",
  ],
  [
    "Se recomanda validare notariala completa",
    "Full notarial validation is recommended",
  ],
];

function replaceLegacyRoText(input: string): string {
  let out = input;
  for (const [from, to] of LEGACY_RO_TO_EN_REPLACEMENTS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }
  return out;
}

function deepReplaceLegacyRo(value: unknown): unknown {
  if (typeof value === "string") return replaceLegacyRoText(value);
  if (Array.isArray(value)) return value.map((item) => deepReplaceLegacyRo(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepReplaceLegacyRo(v)])
    );
  }
  return value;
}

async function cleanupLegacyRomanianReports() {
  const all = await storage.getAllReports();
  let touched = 0;
  for (const row of all) {
    const updates: Partial<Pick<Report, "reportJson" | "notaSimpleJson">> = {};

    if (row.reportJson) {
      try {
        const parsed = JSON.parse(row.reportJson);
        const cleaned = deepReplaceLegacyRo(parsed);
        const next = JSON.stringify(cleaned);
        if (next !== row.reportJson) {
          updates.reportJson = next;
        }
      } catch {
        // ignore invalid legacy JSON
      }
    }

    if (row.notaSimpleJson) {
      try {
        const parsed = JSON.parse(row.notaSimpleJson);
        const cleaned = deepReplaceLegacyRo(parsed);
        const next = JSON.stringify(cleaned);
        if (next !== row.notaSimpleJson) {
          updates.notaSimpleJson = next;
        }
      } catch {
        // ignore invalid legacy JSON
      }
    }

    if (Object.keys(updates).length > 0) {
      await storage.updateReportAdmin(row.id, updates);
      touched += 1;
    }
  }
  if (touched > 0) {
    console.log(`[Vesta] Legacy RO cleanup updated ${touched} report(s).`);
  } else {
    console.log("[Vesta] Legacy RO cleanup found no reports to update.");
  }
}

function requirePythonApiBase(res: Response): string | null {
  if (!PYTHON_API_BASE) {
    res.status(503).json({
      message:
        "Python API is not configured. Set VEST_PYTHON_API_URL to your FastAPI base URL (no trailing slash).",
    });
    return null;
  }
  return PYTHON_API_BASE;
}

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.size === 0) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

function normalizeProductTier(raw: unknown): "analysis_pack" | "expert_report" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["expert", "premium", "expert_report", "full", "raport_expert"].includes(value)) {
    return "expert_report";
  }
  return "analysis_pack";
}

function parseNumericId(raw: unknown): number | null {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(candidate);
  return Number.isFinite(n) ? n : null;
}

function hasMeaningfulExtractedJson(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

type ActorInfo = {
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorName?: string | null;
};

async function sendCompletedEmailToClient(report: Report) {
  const user = await storage.getUser(report.userId);
  const userEmail = user?.email?.trim();
  if (!userEmail) return;

  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPassword = (process.env.SMTP_PASSWORD || "").trim();
  const from = (process.env.SMTP_FROM || smtpUser || "no-reply@vesta.local").trim();
  const useTls = ["1", "true", "yes"].includes((process.env.SMTP_TLS || "true").toLowerCase());
  const webBase = (process.env.VESTA_WEB_BASE_URL || "https://vesta-asset.com").replace(/\/$/, "");
  const reportUrl = `${webBase}/#/reports/${report.id}`;

  const subject = "Vesta AI: Nota Simple este gata";
  const text = [
    "Buna,",
    "",
    "Comanda ta de Nota Simple a fost finalizata.",
    report.address ? `Proprietate: ${report.address}` : undefined,
    report.referenciaCatastral ? `Referinta cadastrala: ${report.referenciaCatastral}` : undefined,
    "",
    `Poti vedea rezultatul aici: ${reportUrl}`,
  ].filter(Boolean).join("\n");

  if (!host) {
    console.log(`[MVP email] Completed report ${report.id} -> ${userEmail}. Configure SMTP_HOST for real sending.`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: false,
    auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
  });
  if (useTls && typeof transporter.options === "object") {
    (transporter.options as any).requireTLS = true;
  }
  await transporter.sendMail({
    from,
    to: userEmail,
    subject,
    text,
  });
}

async function addStatusEvent(
  reportId: number,
  fromStatus: string | null | undefined,
  toStatus: string,
  actor: ActorInfo,
  note?: string
) {
  await storage.createReportStatusEvent({
    reportId,
    fromStatus: fromStatus ?? null,
    toStatus,
    actorUserId: actor.actorUserId ?? null,
    actorEmail: actor.actorEmail ?? null,
    actorName: actor.actorName ?? null,
    note: note ?? null,
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // One-time idempotent cleanup for old report payloads that still contain RO demo content.
  await cleanupLegacyRomanianReports();

  app.get("/api/health", async (_req, res) => {
    const base = PYTHON_API_BASE;
    const python: {
      configured: boolean;
      baseUrl: string | null;
      reachable: boolean;
      error: string | null;
      version: string | null;
    } = {
      configured: Boolean(base),
      // Hide upstream hostname in production (infrastructure fingerprinting).
      baseUrl: IS_PRODUCTION ? null : base || null,
      reachable: false,
      error: null,
      version: null,
    };
    if (!base) {
      python.error =
        process.env.NODE_ENV === "production"
          ? "VEST_PYTHON_API_URL is not set"
          : "VEST_PYTHON_API_URL not set (dev default: http://127.0.0.1:8000)";
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const r = await fetch(`${base}/version`, { signal: controller.signal });
        clearTimeout(timer);
        python.reachable = r.ok;
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          python.version =
            typeof j.version === "string"
              ? j.version
              : typeof j.message === "string"
                ? j.message
                : null;
        } else {
          python.error = `HTTP ${r.status}`;
        }
      } catch (e: any) {
        python.error = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
      }
    }
    res.status(200).json({ ok: true, service: "vesta-web", python });
  });

  // Callback intern din API Python (fără sesiune utilizator)
  app.post("/api/internal/sync-registro-report", async (req, res) => {
    const secret = (process.env.VESTA_INTERNAL_SYNC_SECRET || "").trim();
    const hdr = (req.get("X-Vesta-Internal-Secret") || "").trim();
    if (!secret || hdr !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const body = req.body as Record<string, unknown>;
    const stripeId = typeof body.stripe_payment_intent_id === "string" ? body.stripe_payment_intent_id : "";
    if (!stripeId) {
      return res.status(400).json({ message: "Missing stripe_payment_intent_id" });
    }

    const updates: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId" | "pdfUrl">> = {};

    if (body.status === "failed") {
      updates.status = "failed";
    }
    const rjs = body.report_json_string;
    if (typeof rjs === "string" && rjs.length > 0) {
      updates.reportJson = rjs;
      updates.status = "completed";
    } else if (body.report_json != null && typeof body.report_json === "object") {
      updates.reportJson = JSON.stringify(body.report_json);
      updates.status = "completed";
    }
    if (body.nota_simple_json != null) {
      updates.notaSimpleJson =
        typeof body.nota_simple_json === "string"
          ? body.nota_simple_json
          : JSON.stringify(body.nota_simple_json);
    }
    const incomingPdfUrl =
      typeof body.pdf_url === "string"
        ? body.pdf_url
        : (typeof body.pdfUrl === "string" ? body.pdfUrl : "");
    if (incomingPdfUrl) {
      updates.pdfUrl = incomingPdfUrl;
    }
    if (body.status === "completed" && updates.status !== "failed" && !updates.reportJson) {
      updates.status = "completed";
    }

    const report = await storage.updateReportByStripeSessionId(stripeId, updates);
    if (!report) return res.status(404).json({ message: "Report not found" });
    return res.json({ ok: true, id: report.id });
  });

  // Session in PostgreSQL (connect-pg-simple) — shared across multiple web replicas.
  const isProd = process.env.NODE_ENV === "production";
  const rawSessionSecret = (process.env.SESSION_SECRET || "").trim();
  if (isProd) {
    if (!rawSessionSecret || rawSessionSecret === DEFAULT_SESSION_SECRET) {
      console.error(
        "[vesta-web] FATAL: SESSION_SECRET must be set in production to a strong random value (do not use the dev default)."
      );
      process.exit(1);
    }
  }
  const sessionSecret = rawSessionSecret || DEFAULT_SESSION_SECRET;
  const sessionStore = new PgSession({
    pool: getPool(),
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15,
  });
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        maxAge: 86400000,
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          let user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "User not found" });
          const { ok, needsUpgrade } = await verifyPasswordWithUpgrade(password, user.password);
          if (!ok) {
            return done(null, false, { message: "Invalid password" });
          }
          if (needsUpgrade) {
            const newHash = await hashPasswordPlain(password);
            await storage.updateUserPassword(user.id, newHash);
            user = { ...user, password: newHash };
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const passwordHash = await hashPasswordPlain(data.password);
      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        password: passwordHash,
      });
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        return res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: isAdminEmail(user.email),
        });
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Invalid data" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Authentication failed" });
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: isAdminEmail(user.email),
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: isAdminEmail(user.email),
    });
  });

  // Admin-only endpoints for manual Nota Simple operations.
  app.get("/api/admin/nota-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const type = String(req.query.type || "nota_simple").trim().toLowerCase();
    const rows = await storage.getAllReports();
    const filtered = rows
      .filter((r) => (type ? (r.type || "").toLowerCase() === type : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return res.json(filtered);
  });

  app.get("/api/admin/reports/:id/audit-trail", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const rawId = req.params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid report id" });
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    const events = await storage.getReportStatusEvents(id);
    return res.json(events);
  });

  app.patch("/api/admin/reports/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const rawId = req.params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid report id" });
    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    const allowed = new Set([
      "paid",
      "submitted_manual",
      "waiting_partner",
      "pdf_received",
      "completed",
      "failed_refundable",
      "failed",
      "refunded",
      "processing",
      "pending",
    ]);
    if (!allowed.has(nextStatus)) {
      return res.status(400).json({ message: "Unsupported status" });
    }
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    const previousStatus = report.status;
    const updated = await storage.updateReportAdmin(id, { status: nextStatus });
    if (!updated) return res.status(404).json({ message: "Report not found" });
    await addStatusEvent(
      id,
      previousStatus,
      nextStatus,
      {
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        actorName: user?.username ?? null,
      },
      typeof req.body?.note === "string" ? req.body.note : null
    );
    if (nextStatus === "completed" && previousStatus !== "completed") {
      try {
        await sendCompletedEmailToClient(updated);
      } catch (err: any) {
        console.error(`[Vesta] Failed to send completed email for report ${id}:`, err?.message || err);
      }
    }
    return res.json(updated);
  });

  app.post("/api/admin/reports/:id/upload-nota-simple", upload.single("file"), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const rawId = req.params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid report id" });
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ message: "Missing file" });

    const base = requirePythonApiBase(res);
    if (!base) return;

    try {
      const beforePdf = await storage.getReportAdmin(id);
      const statusBeforePdf = beforePdf?.status ?? null;
      await storage.updateReportAdmin(id, { status: "pdf_received" });
      await addStatusEvent(
        id,
        statusBeforePdf,
        "pdf_received",
        {
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorName: user?.username ?? null,
        },
        "PDF uploaded by admin"
      );

      const form = new FormData();
      form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/pdf" }), file.originalname || "nota-simple.pdf");

      const pyRes = await fetch(`${base}/proceseaza-nota-simple/`, {
        method: "POST",
        body: form,
      });
      const pyData = await pyRes.json().catch(() => ({} as Record<string, unknown>));
      if (!pyRes.ok) {
        await storage.updateReportAdmin(id, { status: "failed_refundable" });
        await addStatusEvent(
          id,
          "pdf_received",
          "failed_refundable",
          {
            actorUserId: user?.id ?? null,
            actorEmail: user?.email ?? null,
            actorName: user?.username ?? null,
          },
          "OCR failed after PDF upload"
        );
        return res.status(pyRes.status).json(pyData);
      }

      const extracted = (pyData as any)?.extracted ?? pyData;
      const updated = await storage.updateReportAdmin(id, {
        status: "completed",
        notaSimpleJson: JSON.stringify(extracted ?? {}),
      });
      await addStatusEvent(
        id,
        "pdf_received",
        "completed",
        {
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorName: user?.username ?? null,
        },
        "OCR succeeded"
      );
      if (updated) {
        try {
          await sendCompletedEmailToClient(updated);
        } catch (err: any) {
          console.error(`[Vesta] Failed to send completed email for report ${id}:`, err?.message || err);
        }
      }
      return res.json({ ok: true, report: updated, extraction: pyData });
    } catch (err: any) {
      await storage.updateReportAdmin(id, { status: "failed_refundable" });
      await addStatusEvent(
        id,
        "pdf_received",
        "failed_refundable",
        {
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorName: user?.username ?? null,
        },
        "Upload/OCR exception"
      );
      return res.status(500).json(jsonServerError("Upload/OCR failed", err));
    }
  });

  const NOTA_JSON_MAX_BYTES = 2 * 1024 * 1024;

  app.patch("/api/admin/reports/:id/pdf-url", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const rawId = req.params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid report id" });
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    const pdfUrl = typeof req.body?.pdfUrl === "string" ? req.body.pdfUrl.trim() : "";
    if (!pdfUrl) return res.status(400).json({ message: "Missing pdfUrl" });
    const previousStatus = report.status;
    const updated = await storage.updateReportAdmin(id, { pdfUrl });
    if (!updated) return res.status(404).json({ message: "Report not found" });
    await addStatusEvent(
      id,
      previousStatus,
      updated.status,
      {
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        actorName: user?.username ?? null,
      },
      "pdfUrl set by admin"
    );
    return res.json(updated);
  });

  app.patch("/api/admin/reports/:id/nota-simple-json", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });
    const rawId = req.params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid report id" });
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const body = req.body as Record<string, unknown>;
    let jsonStr: string;
    if (body.notaSimpleJson != null && typeof body.notaSimpleJson === "object") {
      jsonStr = JSON.stringify(body.notaSimpleJson);
    } else if (typeof body.notaSimpleJson === "string") {
      jsonStr = body.notaSimpleJson.trim();
    } else {
      return res.status(400).json({ message: "Missing notaSimpleJson" });
    }
    if (!jsonStr.length) return res.status(400).json({ message: "Empty notaSimpleJson" });
    if (jsonStr.length > NOTA_JSON_MAX_BYTES) {
      return res.status(400).json({ message: "notaSimpleJson too large" });
    }
    try {
      JSON.parse(jsonStr);
    } catch {
      return res.status(400).json({ message: "Invalid JSON" });
    }

    const markComplete = body.complete !== false;
    const previousStatus = report.status;
    const updates: Partial<Report> = { notaSimpleJson: jsonStr };
    if (markComplete) {
      updates.status = "completed";
      updates.completedAt = new Date().toISOString();
    }
    const updated = await storage.updateReportAdmin(id, updates);
    if (!updated) return res.status(404).json({ message: "Report not found" });
    await addStatusEvent(
      id,
      previousStatus,
      updated.status,
      {
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        actorName: user?.username ?? null,
      },
      markComplete ? "notaSimpleJson saved by admin (completed)" : "notaSimpleJson saved by admin (draft)"
    );
    if (markComplete && previousStatus !== "completed") {
      try {
        await sendCompletedEmailToClient(updated);
      } catch (err: any) {
        console.error(`[Vesta] Failed to send completed email for report ${id}:`, err?.message || err);
      }
    }
    return res.json(updated);
  });

  // Partner workflow: submit report metadata to Nota Simple provider.
  app.post("/api/nota-partner/request", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });

    const reportId = parseNumericId((req.body as Record<string, unknown>)?.reportId);
    if (!reportId) return res.status(400).json({ message: "Missing reportId" });
    const report = await storage.getReportAdmin(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    try {
      const provider = getNotaProviderAdapter();
      const partner = await provider.createOrder({
        reportId: report.id,
        referenciaCatastral:
          typeof req.body?.referenciaCatastral === "string"
            ? req.body.referenciaCatastral
            : report.referenciaCatastral,
        address: typeof req.body?.address === "string" ? req.body.address : report.address,
        documentUrl:
          typeof req.body?.documentUrl === "string"
            ? req.body.documentUrl
            : report.pdfUrl || null,
        documentBase64:
          typeof req.body?.documentBase64 === "string"
            ? req.body.documentBase64
            : null,
        documentMimeType:
          typeof req.body?.documentMimeType === "string"
            ? req.body.documentMimeType
            : null,
        webhookUrl:
          typeof req.body?.webhookUrl === "string"
            ? req.body.webhookUrl
            : null,
        metadata:
          typeof req.body?.metadata === "object" && req.body?.metadata
            ? req.body.metadata as Record<string, unknown>
            : null,
      });

      const previousStatus = report.status;
      const updates: Partial<Report> = {
        status: partner.normalizedStatus,
        providerName: partner.providerName,
        providerOrderId: partner.providerOrderId,
        providerStatus: partner.providerStatus,
        providerRawJson: JSON.stringify(partner.raw),
        requestedAt: new Date().toISOString(),
        pdfUrl: partner.pdfUrl || report.pdfUrl,
      };
      const updated = await storage.updateReportAdmin(report.id, updates);
      if (!updated) return res.status(404).json({ message: "Report not found after update" });

      await addStatusEvent(
        report.id,
        previousStatus,
        partner.normalizedStatus,
        {
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorName: user?.username ?? null,
        },
        `Partner order created (${partner.providerName}:${partner.providerOrderId})`
      );

      return res.json({ ok: true, report: updated, partner });
    } catch (err: any) {
      return res.status(502).json(jsonServerError("Partner request failed", err));
    }
  });

  // Partner webhook callback (status updates, optional extracted JSON/PDF URL).
  app.post("/api/nota-partner/webhook", async (req, res) => {
    const signatureHeader = getWebhookSignatureHeaderName();
    const signatureValue = (req.get(signatureHeader) || "").trim();
    if (!verifyWebhookSignature((req as any).rawBody, signatureValue)) {
      return res.status(401).json({ message: `Unauthorized webhook (${signatureHeader})` });
    }

    const normalized = normalizeWebhookPayload(req.body as Record<string, unknown>);
    const providerOrderId = (normalized.providerOrderId || "").trim();
    if (!providerOrderId) {
      return res.status(400).json({ message: "Missing providerOrderId/orderId" });
    }

    const report = await storage.getReportByProviderOrderId(providerOrderId);
    if (!report) return res.status(404).json({ message: "Report not found for provider order" });

    const mapped = mapWebhookStatusToInternal(normalized.status);
    const updates: Partial<Report> = {
      providerStatus: mapped.providerStatus,
      providerRawJson: JSON.stringify(req.body ?? {}),
      status: mapped.normalizedStatus,
    };
    if (normalized.pdfUrl) updates.pdfUrl = normalized.pdfUrl;
    if (mapped.lifecycleStatus === "completed") {
      updates.completedAt = new Date().toISOString();
    }
    const hasExtractedData = hasMeaningfulExtractedJson(normalized.extractedJson);
    if (normalized.extractedJson != null && (hasExtractedData || mapped.lifecycleStatus === "completed")) {
      updates.notaSimpleJson =
        typeof normalized.extractedJson === "string"
          ? normalized.extractedJson
          : JSON.stringify(normalized.extractedJson);
    }
    if (mapped.lifecycleStatus === "completed" || hasExtractedData) {
      updates.status = "completed";
      if (!updates.completedAt) {
        updates.completedAt = new Date().toISOString();
      }
    }

    const previousStatus = report.status;
    const updated = await storage.updateReportByProviderOrderId(providerOrderId, updates);
    if (!updated) return res.status(404).json({ message: "Report not found after webhook update" });

    await addStatusEvent(
      updated.id,
      previousStatus,
      updates.status || previousStatus || "pending",
      {
        actorUserId: null,
        actorEmail: null,
        actorName: normalized.event ? `webhook:${normalized.event}` : "webhook",
      },
      `Partner webhook status=${mapped.providerStatus}`
    );

    if (updates.status === "completed" && previousStatus !== "completed") {
      try {
        await sendCompletedEmailToClient(updated);
      } catch (err: any) {
        console.error(`[Vesta] Failed to send completed email for report ${updated.id}:`, err?.message || err);
      }
    }

    return res.json({ ok: true, reportId: updated.id, status: updated.status });
  });

  // Admin-triggered retry/poll endpoint for partner status.
  app.post("/api/nota-partner/:id/retry", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    if (!isAdminEmail(user?.email)) return res.status(403).json({ message: "Forbidden" });

    const id = parseNumericId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid report id" });
    const report = await storage.getReportAdmin(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (!report.providerOrderId) {
      return res.status(400).json({ message: "Report has no providerOrderId; submit to partner first" });
    }

    try {
      const provider = getNotaProviderAdapter();
      const partner = await provider.getStatus(report.providerOrderId);
      const updates: Partial<Report> = {
        providerName: partner.providerName,
        providerStatus: partner.providerStatus,
        providerRawJson: JSON.stringify(partner.raw),
        status: partner.normalizedStatus,
      };
      if (partner.pdfUrl) updates.pdfUrl = partner.pdfUrl;
      if (partner.lifecycleStatus === "completed") updates.completedAt = new Date().toISOString();
      const hasExtractedData = hasMeaningfulExtractedJson(partner.extractedJson);
      if (partner.extractedJson != null && (hasExtractedData || partner.lifecycleStatus === "completed")) {
        updates.notaSimpleJson =
          typeof partner.extractedJson === "string"
            ? partner.extractedJson
            : JSON.stringify(partner.extractedJson);
      }
      if (partner.lifecycleStatus === "completed" || hasExtractedData) {
        updates.status = "completed";
        if (!updates.completedAt) {
          updates.completedAt = new Date().toISOString();
        }
      }

      const previousStatus = report.status;
      const updated = await storage.updateReportAdmin(id, updates);
      if (!updated) return res.status(404).json({ message: "Report not found after retry update" });

      await addStatusEvent(
        updated.id,
        previousStatus,
        updates.status || previousStatus || "pending",
        {
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorName: user?.username ?? null,
        },
        `Partner retry poll (${partner.providerStatus})`
      );

      if (updates.status === "completed" && previousStatus !== "completed") {
        try {
          await sendCompletedEmailToClient(updated);
        } catch (err: any) {
          console.error(`[Vesta] Failed to send completed email for report ${updated.id}:`, err?.message || err);
        }
      }

      return res.json({ ok: true, report: updated, partner });
    } catch (err: any) {
      return res.status(502).json(jsonServerError("Partner retry failed", err));
    }
  });

  // Proxy to Railway backend — Property Identification
  app.post("/api/property/identify", async (req, res) => {
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const { lat, lon } = req.body;
      const response = await fetch(
        `${base}/identifica-imobil/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon }),
        }
      );
      const raw = await response.json();

      // Normalise field names so frontend always gets consistent shape
      if (!raw.success) {
        return res.status(404).json({ message: raw.message || "Property not found at this location" });
      }

      const normalised = {
        referenciaCatastral: raw.ref_catastral ?? raw.referinta_cadastrala ?? raw.referinta ?? "",
        address:             raw.address ?? "",
        anoConstruccion:     raw.year_built ?? "",
        superficie:          raw.sq_meters ?? raw.data?.sq_meters ?? "",
        municipio:           raw.address ? raw.address.split(" ").slice(-2, -1)[0] : "",
        provincia:           raw.address ? raw.address.split("(")[1]?.replace(")", "") : "",
        oportunityScore:     raw.scor ?? raw.data?.scor_oportunitate ?? 0,
        // keep the full raw data too
        _raw: raw,
      };

      return res.json(normalised);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Failed to identify property", err));
    }
  });

  // Proxy — Financial Analysis (adapts identify-shaped bodies → property_data / market_data)
  app.post("/api/property/financial-analysis", async (req, res) => {
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const upstreamBody = buildFinancialAnalysisUpstreamBody(
        req.body as Record<string, unknown>
      );
      const response = await fetch(
        `${base}/financial-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upstreamBody),
        }
      );
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      const normalized = normalizeFinancialAnalysisForClient(data, upstreamBody);
      return res.json(normalized);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Failed to get financial analysis", err));
    }
  });

  // Proxy — Market Trends
  app.get("/api/market-trend", async (_req, res) => {
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const response = await fetch(
        `${base}/market-trend`
      );
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Failed to get market trends", err));
    }
  });

  // Zone analysis: POI counts from OpenStreetMap (Overpass) when available; heuristic fallback otherwise.
  app.post("/api/zone/analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const lat = Number(req.body?.lat);
    const lon = Number(req.body?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ message: "Invalid coordinates" });
    }
    const tier = normalizeProductTier(req.body?.tier);
    const locale = resolveZoneLocale(req.body?.locale);
    const osm = await fetchOsmNearbyEssentials(lat, lon);
    const zoneAnalysis = buildZoneAnalysisPayload({
      lat,
      lon,
      address: typeof req.body?.address === "string" ? req.body.address : "",
      financialData: typeof req.body?.financialData === "object" && req.body?.financialData
        ? req.body.financialData as Record<string, unknown>
        : {},
      tier,
      locale,
      osm,
    });
    return res.json({ zoneAnalysis });
  });

  app.get("/api/spain-property-search/status", (req, res) => {
    handleSpainPropertySearchStatus(req, res);
  });

  app.post("/api/spain-property-search/chat", (req, res) => {
    req.setTimeout(120_000);
    res.setTimeout(120_000);
    void handleSpainPropertySearchChat(req, res);
  });

  // Saved Properties
  app.get("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const properties = await storage.getSavedProperties(user.id);
    return res.json(properties);
  });

  app.post("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const property = await storage.saveProperty({ ...req.body, userId: user.id });
    return res.json(property);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    await storage.deleteProperty(parseInt(req.params.id), user.id);
    return res.json({ ok: true });
  });

  // Proxy — Stripe PaymentIntent (creeaza-plata)
  app.post("/api/payment/create", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const user = req.user as any;
      const response = await fetch(
        `${base}/creeaza-plata/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email ?? "",
            property_id: req.body.property_id ?? 0,
            tip: normalizeProductTier(req.body.tip),
            referencia_catastral: req.body.referencia_catastral ?? "",
            address: req.body.address ?? "",
            lat: req.body.lat,
            lon: req.body.lon,
            context_json:
              typeof req.body.context_json === "string" ? req.body.context_json : undefined,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Payment creation failed", err));
    }
  });

  // Proxy — Stripe checkout session
  app.post("/api/checkout/create", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const { property_id, success_url, cancel_url } = req.body;
      const user = req.user as any;
      const spa = defaultSpaOrigin();
      const response = await fetch(
        `${base}/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: property_id ?? 0,
            user_id: user.id,
            product: normalizeProductTier(req.body.product),
            success_url: success_url ?? `${spa}/#/reports`,
            cancel_url: cancel_url ?? `${spa}/#/map`,
          }),
        }
      );
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Checkout failed", err));
    }
  });

  // Proxy — Async report generation
  app.post("/api/report/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const response = await fetch(
        `${base}/report/generate-async`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
        }
      );
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Report generation failed", err));
    }
  });

  // Proxy — Poll async report status
  app.get("/api/report/status/:jobId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const response = await fetch(
        `${base}/report/async-status/${req.params.jobId}`
      );
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Status check failed", err));
    }
  });

  // Proxy — Plată → Nota Simple → AI: stare agregată după PaymentIntent
  app.get("/api/payment-flow/status/:paymentIntentId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const base = requirePythonApiBase(res);
    if (!base) return;
    try {
      const id = encodeURIComponent(req.params.paymentIntentId);
      const response = await fetch(`${base}/payment-flow/status/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json(jsonServerError("Payment flow status failed", err));
    }
  });

  // Reports
  app.get("/api/reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const userReports = await storage.getReports(user.id);
    return res.json(userReports);
  });

  app.get("/api/reports/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const report = await storage.getReport(parseInt(req.params.id), user.id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    return res.json(report);
  });

  app.post("/api/reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const report = await storage.createReport({ ...req.body, userId: user.id });
    return res.json(report);
  });

  app.patch("/api/reports/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const report = await storage.updateReport(parseInt(req.params.id), user.id, req.body);
    if (!report) return res.status(404).json({ message: "Report not found" });
    return res.json(report);
  });

  return httpServer;
}
