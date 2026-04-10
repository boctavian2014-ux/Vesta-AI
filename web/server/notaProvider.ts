import { createHmac, timingSafeEqual } from "crypto";

export type PartnerLifecycleStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "needs_manual";

export type InternalReportStatus =
  | "submitted_manual"
  | "waiting_partner"
  | "pdf_received"
  | "completed"
  | "failed_refundable";

export type NotaPartnerOrderInput = {
  reportId: number;
  referenciaCatastral?: string | null;
  address?: string | null;
  documentUrl?: string | null;
  documentBase64?: string | null;
  documentMimeType?: string | null;
  webhookUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NotaPartnerOrderResult = {
  providerName: string;
  providerOrderId: string;
  providerStatus: string;
  lifecycleStatus: PartnerLifecycleStatus;
  normalizedStatus: InternalReportStatus;
  pdfUrl?: string;
  raw: Record<string, unknown>;
};

export type NotaPartnerStatusResult = {
  providerName: string;
  providerOrderId: string;
  providerStatus: string;
  lifecycleStatus: PartnerLifecycleStatus;
  normalizedStatus: InternalReportStatus;
  pdfUrl?: string;
  extractedJson?: unknown;
  raw: Record<string, unknown>;
};

export type NotaPartnerDownloadResult = {
  providerName: string;
  providerOrderId: string;
  contentType: string;
  bytes: ArrayBuffer;
};

export interface NotaProviderAdapter {
  providerName: string;
  createOrder(input: NotaPartnerOrderInput): Promise<NotaPartnerOrderResult>;
  getStatus(providerOrderId: string): Promise<NotaPartnerStatusResult>;
  downloadPdf(providerOrderId: string, pdfUrl?: string): Promise<NotaPartnerDownloadResult>;
}

const providerName = "matil";
const matilBase = (process.env.MATIL_API_BASE || "https://api.matil.ai/v3").trim().replace(/\/$/, "");
const matilApiKey = (process.env.MATIL_API_KEY || "").trim();
const matilDeploymentId = (process.env.MATIL_DEPLOYMENT_ID || "").trim();
const matilWebhookSecret = (process.env.MATIL_WEBHOOK_SECRET || "").trim();
const timeoutMs = Number(process.env.MATIL_TIMEOUT_MS || "20000");
const forceMock = ["1", "true", "yes"].includes(
  (process.env.MATIL_PROVIDER_MOCK || "").trim().toLowerCase()
);

function shouldUseMockProvider(): boolean {
  if (forceMock) return true;
  return !matilApiKey || !matilDeploymentId;
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 20000);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true }
  );
  return controller.signal;
}

function mapMatilStatus(rawStatus: unknown): PartnerLifecycleStatus {
  const status = String(rawStatus ?? "").trim().toLowerCase();
  if (["pending", "queued", "accepted", "received"].includes(status)) return "queued";
  if (["running", "processing", "in_progress"].includes(status)) return "processing";
  if (["completed", "completed_with_errors"].includes(status)) return "completed";
  if (["failed", "error", "rejected"].includes(status)) return "failed";
  return "needs_manual";
}

export function mapPartnerLifecycleToInternalStatus(status: PartnerLifecycleStatus): InternalReportStatus {
  if (status === "queued" || status === "processing") return "waiting_partner";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed_refundable";
  return "submitted_manual";
}

function requiredWebhookUrl(inputUrl: string | null | undefined): string {
  const explicit = (inputUrl || "").trim();
  if (explicit) return explicit;
  const webBase = (process.env.VESTA_WEB_BASE_URL || "").trim().replace(/\/$/, "");
  if (webBase) return `${webBase}/api/nota-partner/webhook`;
  throw new Error("Missing webhook URL. Provide input.webhookUrl or set VESTA_WEB_BASE_URL.");
}

function toMatilHeaders(): Record<string, string> {
  if (!matilApiKey) throw new Error("MATIL_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    "x-api-key": matilApiKey,
  };
}

function buildMatilDocuments(input: NotaPartnerOrderInput): Array<Record<string, unknown>> {
  if (input.documentBase64 && input.documentBase64.trim()) {
    return [
      {
        type: "base64",
        content: input.documentBase64.trim(),
        mime_type: input.documentMimeType || "application/pdf",
        filename: `report-${input.reportId}.pdf`,
      },
    ];
  }
  if (input.documentUrl && input.documentUrl.trim()) {
    return [{ type: "url", url: input.documentUrl.trim() }];
  }
  throw new Error("Matil requires a source document (documentUrl or documentBase64).");
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

class MockMatilProviderAdapter implements NotaProviderAdapter {
  providerName = `${providerName}_mock`;

  async createOrder(input: NotaPartnerOrderInput): Promise<NotaPartnerOrderResult> {
    const providerOrderId = `mock-entry-${input.reportId}-${Date.now()}`;
    const lifecycleStatus: PartnerLifecycleStatus = "queued";
    return {
      providerName: this.providerName,
      providerOrderId,
      providerStatus: "pending",
      lifecycleStatus,
      normalizedStatus: mapPartnerLifecycleToInternalStatus(lifecycleStatus),
      raw: { mock: true, input },
    };
  }

  async getStatus(providerOrderId: string): Promise<NotaPartnerStatusResult> {
    const lifecycleStatus: PartnerLifecycleStatus = "processing";
    return {
      providerName: this.providerName,
      providerOrderId,
      providerStatus: "processing",
      lifecycleStatus,
      normalizedStatus: mapPartnerLifecycleToInternalStatus(lifecycleStatus),
      raw: { mock: true, providerOrderId },
    };
  }

  async downloadPdf(providerOrderId: string): Promise<NotaPartnerDownloadResult> {
    throw new Error(`Matil adapter does not expose source PDF download for entry ${providerOrderId}`);
  }
}

class MatilProviderAdapter implements NotaProviderAdapter {
  providerName = providerName;

  async createOrder(input: NotaPartnerOrderInput): Promise<NotaPartnerOrderResult> {
    const webhookUrl = requiredWebhookUrl(input.webhookUrl);
    const webhookConfig: Record<string, unknown> = { url: webhookUrl };
    if (matilWebhookSecret) {
      webhookConfig.secret = matilWebhookSecret;
      webhookConfig.incremental = true;
    }

    const payload = {
      documents: buildMatilDocuments(input),
      webhook: webhookConfig,
      metadata: {
        report_id: String(input.reportId),
        referencia_catastral: input.referenciaCatastral || null,
        address: input.address || null,
        ...(input.metadata || {}),
      },
    };

    const res = await fetch(`${matilBase}/deployments/${encodeURIComponent(matilDeploymentId)}/async`, {
      method: "POST",
      headers: toMatilHeaders(),
      body: JSON.stringify(payload),
      signal: withTimeout(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Matil createOrder failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const providerOrderId = safeString(data.entry_id);
    if (!providerOrderId) throw new Error("Matil response missing entry_id");
    const providerStatus = safeString(data.status || "pending") || "pending";
    const lifecycleStatus = mapMatilStatus(providerStatus);

    return {
      providerName: this.providerName,
      providerOrderId,
      providerStatus,
      lifecycleStatus,
      normalizedStatus: mapPartnerLifecycleToInternalStatus(lifecycleStatus),
      raw: data,
    };
  }

  async getStatus(providerOrderId: string): Promise<NotaPartnerStatusResult> {
    const res = await fetch(`${matilBase}/entries/${encodeURIComponent(providerOrderId)}`, {
      method: "GET",
      headers: toMatilHeaders(),
      signal: withTimeout(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Matil getStatus failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const providerStatus = safeString(data.status || "unknown") || "unknown";
    const lifecycleStatus = mapMatilStatus(providerStatus);
    const extractedJson = asObject(data).data ?? null;

    return {
      providerName: this.providerName,
      providerOrderId,
      providerStatus,
      lifecycleStatus,
      normalizedStatus: mapPartnerLifecycleToInternalStatus(lifecycleStatus),
      extractedJson,
      raw: data,
    };
  }

  async downloadPdf(providerOrderId: string): Promise<NotaPartnerDownloadResult> {
    throw new Error(`Matil adapter does not support PDF download for entry ${providerOrderId}`);
  }
}

export function getNotaProviderAdapter(): NotaProviderAdapter {
  if (shouldUseMockProvider()) return new MockMatilProviderAdapter();
  return new MatilProviderAdapter();
}

export type PartnerWebhookPayload = {
  providerOrderId?: string;
  status?: string;
  extractedJson?: unknown;
  pdfUrl?: string;
  event?: string;
  metadata?: Record<string, unknown> | null;
};

function resolveEntryId(payload: Record<string, unknown>): string | undefined {
  const direct = safeString(payload.entry_id || payload.entryId || payload.id);
  if (direct) return direct;
  const nested = asObject(payload.entry);
  const nestedId = safeString(nested.entry_id || nested.entryId || nested.id);
  if (nestedId) return nestedId;
  const data = asObject(payload.data);
  const fromData = safeString(data.entry_id || data.entryId || data.id);
  if (fromData) return fromData;
  return undefined;
}

function resolveStatus(payload: Record<string, unknown>): string | undefined {
  const direct = safeString(payload.status);
  if (direct) return direct;
  const entry = asObject(payload.entry);
  const entryStatus = safeString(entry.status);
  if (entryStatus) return entryStatus;
  const event = safeString(payload.event);
  if (event === "structurer.completed") return "completed";
  if (event === "structurer.failed") return "failed";
  return undefined;
}

function resolveExtractedJson(payload: Record<string, unknown>): unknown {
  if (payload.data && typeof payload.data === "object") return payload.data;
  const entry = asObject(payload.entry);
  if (entry.data && typeof entry.data === "object") return entry.data;
  return undefined;
}

function resolvePdfUrl(payload: Record<string, unknown>): string | undefined {
  const direct = safeString(payload.pdf_url || payload.pdfUrl);
  if (direct) return direct;
  const entry = asObject(payload.entry);
  const fromEntry = safeString(entry.pdf_url || entry.pdfUrl);
  if (fromEntry) return fromEntry;
  const data = asObject(payload.data);
  return safeString(data.pdf_url || data.pdfUrl) || undefined;
}

export function normalizeWebhookPayload(
  payload: Record<string, unknown> | null | undefined
): PartnerWebhookPayload {
  if (!payload || typeof payload !== "object") return {};
  return {
    providerOrderId: resolveEntryId(payload),
    status: resolveStatus(payload),
    extractedJson: resolveExtractedJson(payload),
    pdfUrl: resolvePdfUrl(payload),
    event: safeString(payload.event) || undefined,
    metadata: asObject(payload.metadata),
  };
}

export function mapWebhookStatusToInternal(status: unknown): {
  providerStatus: string;
  lifecycleStatus: PartnerLifecycleStatus;
  normalizedStatus: InternalReportStatus;
} {
  const providerStatus = safeString(status || "unknown") || "unknown";
  const lifecycleStatus = mapMatilStatus(providerStatus);
  return {
    providerStatus,
    lifecycleStatus,
    normalizedStatus: mapPartnerLifecycleToInternalStatus(lifecycleStatus),
  };
}

export function getWebhookSignatureHeaderName(): string {
  return "x-matil-signature";
}

function parseMatilSignatureHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = header.split(",").map((p) => p.trim());
  const map: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    map[k] = v;
  }
  if (!map.t || !map.v1) return null;
  return { timestamp: map.t, signature: map.v1 };
}

function toBuffer(rawBody: unknown): Buffer {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  if (rawBody == null) return Buffer.alloc(0);
  return Buffer.from(JSON.stringify(rawBody), "utf8");
}

export function verifyWebhookSignature(
  rawBody: unknown,
  signatureHeaderValue: string | undefined | null
): boolean {
  if (!matilWebhookSecret) return false;
  const header = (signatureHeaderValue || "").trim();
  if (!header) return false;

  const parsed = parseMatilSignatureHeader(header);
  if (!parsed) return false;

  const ts = Number(parsed.timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const payload = toBuffer(rawBody).toString("utf8");
  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = createHmac("sha256", matilWebhookSecret)
    .update(signedPayload)
    .digest("hex");

  const incomingBuf = Buffer.from(parsed.signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (incomingBuf.length === 0 || incomingBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(incomingBuf, expectedBuf);
}
