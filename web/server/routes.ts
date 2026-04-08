import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import multer from "multer";
import * as nodemailer from "nodemailer";
import { registerSchema, loginSchema, type Report } from "@shared/schema";
import {
  buildFinancialAnalysisUpstreamBody,
  normalizeFinancialAnalysisForClient,
} from "./financialPayload";

const SessionStore = MemoryStore(session);
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

function hashPassword(password: string): string {
  // Simple hash for demo — use bcrypt in production
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "hashed_" + Math.abs(hash).toString(36);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

    const updates: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId">> = {};

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
    if (body.status === "completed" && updates.status !== "failed" && !updates.reportJson) {
      updates.status = "completed";
    }

    const report = await storage.updateReportByStripeSessionId(stripeId, updates);
    if (!report) return res.status(404).json({ message: "Report not found" });
    return res.json({ ok: true, id: report.id });
  });

  // Session
  app.use(
    session({
      secret: "vesta-ai-secret-key-2026",
      resave: false,
      saveUninitialized: false,
      store: new SessionStore({ checkPeriod: 86400000 }),
      cookie: { maxAge: 86400000 },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "User not found" });
          if (user.password !== hashPassword(password)) {
            return done(null, false, { message: "Invalid password" });
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
      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        password: hashPassword(data.password),
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
      return res.status(500).json({ message: "Upload/OCR failed", error: err.message });
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
      return res.status(500).json({ message: "Failed to identify property", error: err.message });
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
      return res.status(500).json({ message: "Failed to get financial analysis", error: err.message });
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
      return res.status(500).json({ message: "Failed to get market trends", error: err.message });
    }
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
            tip: req.body.tip ?? "nota_simple",
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
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: "Payment creation failed", error: err.message });
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
      const response = await fetch(
        `${base}/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: property_id ?? 0,
            user_id: user.id,
            product: req.body.product ?? "nota_simple",
            success_url: success_url ?? "https://www.perplexity.ai/computer/a/vesta-ai-dXVERI0mRBaIDCn.9K69dw/#/reports",
            cancel_url: cancel_url ?? "https://www.perplexity.ai/computer/a/vesta-ai-dXVERI0mRBaIDCn.9K69dw/#/map",
          }),
        }
      );
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: "Checkout failed", error: err.message });
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
      return res.status(500).json({ message: "Report generation failed", error: err.message });
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
      return res.status(500).json({ message: "Status check failed", error: err.message });
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
      return res.status(500).json({ message: "Payment flow status failed", error: err.message });
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
