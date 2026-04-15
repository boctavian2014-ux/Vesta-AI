import express, { type Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { getHelmetContentSecurityPolicy } from "./cspConfig";
import { closeDatabase, initDatabase } from "./db";
import { envRateLimitMax } from "./rateLimitEnv";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === "production";

declare module "express-serve-static-core" {
  interface Request {
    /** Correlates access logs, error logs, and optional client `X-Request-Id` header. */
    requestId?: string;
  }
}

const REQUEST_ID_INCOMING_RE = /^[a-zA-Z0-9_.-]{8,128}$/;

function assignRequestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = (req.get("x-request-id") || req.get("X-Request-Id") || "").trim();
  const id =
    incoming.length >= 8 && REQUEST_ID_INCOMING_RE.test(incoming) ? incoming.slice(0, 128) : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

let fatalExitStarted = false;

/** Milliseconds before process.exit after a fatal handler (log flush / Railway log drain). */
function fatalExitDelayMs(): number {
  const raw = Number.parseInt((process.env.VESTA_FATAL_EXIT_DELAY_MS || "").trim(), 10);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30_000) return raw;
  return 400;
}

function exitAfterFatal(kind: string, err: unknown): void {
  const ts = new Date().toISOString();
  console.error(`[vesta-web] FATAL ${ts} ${kind}:`, err);
  if (fatalExitStarted) return;
  fatalExitStarted = true;
  const delay = fatalExitDelayMs();
  const doExit = () => process.exit(1);
  if (delay <= 0) {
    // Defer one tick so stderr/console buffers can flush before hard exit (Railway logs).
    setImmediate(doExit);
    return;
  }
  // Do not `.unref()` — the timer must run; unref can let the process exit before `process.exit(1)`.
  setTimeout(doExit, delay);
}

process.on("uncaughtException", (err) => {
  exitAfterFatal("uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  exitAfterFatal("unhandledRejection", reason);
});

// Railway / reverse proxy: needed for secure cookies, correct client IP, and rate limiting
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(assignRequestId);

// HSTS, X-Content-Type-Options, etc. CSP: only in production when VESTA_CSP_REPORT_ONLY is set (see README).
const helmetCsp = getHelmetContentSecurityPolicy();
if (helmetCsp !== false) {
  console.log(
    "[vesta-web] Helmet: Content-Security-Policy-Report-Only header enabled (production + VESTA_CSP_REPORT_ONLY).",
  );
}
app.use(
  helmet({
    contentSecurityPolicy: helmetCsp === false ? false : helmetCsp,
    crossOriginEmbedderPolicy: false,
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envRateLimitMax("VESTA_RL_AUTH_LOGIN_MAX", 40, 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again shortly." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: envRateLimitMax("VESTA_RL_AUTH_REGISTER_MAX", 15, 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts. Please try again later." },
});

app.use((req, res, next) => {
  if (req.path === "/api/auth/login" && req.method === "POST") {
    return loginLimiter(req, res, next);
  }
  if (req.path === "/api/auth/register" && req.method === "POST") {
    return registerLimiter(req, res, next);
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown = undefined;
  const isProd = isProduction;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const rid = req.requestId ? `[${req.requestId}] ` : "";
      let logLine = `${rid}${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Never log full JSON bodies in production (PII / tokens in logs).
      if (!isProd && capturedJsonResponse !== undefined) {
        const s = JSON.stringify(capturedJsonResponse);
        const max = 400;
        logLine += s.length > max ? ` :: ${s.slice(0, max)}…` : ` :: ${s}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initDatabase();
  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const statusNum = Number(status) || 500;
    const isProd = isProduction;
    const rid = req.requestId;

    if (rid) {
      console.error(`[vesta-web] [${rid}] Internal Server Error:`, err);
    } else {
      console.error("[vesta-web] Internal Server Error:", err);
    }

    if (res.headersSent) {
      return next(err);
    }

    const clientMessage =
      isProd && statusNum >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";

    if (statusNum >= 500 && rid) {
      return res.status(statusNum).json({ message: clientMessage, requestId: rid });
    }
    return res.status(statusNum).json({ message: clientMessage });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  const shutdownMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || "10000");
  let shuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutdown (${signal}): closing HTTP server...`);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        log(`shutdown: HTTP close timed out after ${shutdownMs}ms, draining pool anyway`);
        resolve();
      }, shutdownMs);
      httpServer.close((err) => {
        clearTimeout(timer);
        if (err) console.error("[vesta-web] shutdown: httpServer.close", err);
        resolve();
      });
    });

    try {
      await closeDatabase();
      log("shutdown: PostgreSQL pool closed");
    } catch (e) {
      console.error("[vesta-web] shutdown: closeDatabase failed", e);
    }
    process.exit(0);
  }

  process.once("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
})();
