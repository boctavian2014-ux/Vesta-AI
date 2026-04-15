import { Fragment, useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useUiLocale } from "@/lib/ui-locale";
import { getReportsStrings, isReportDemoPreview } from "@/lib/reports-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";
import {
  ArrowLeft, TrendingUp, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, MapPin, Scale, ShieldAlert,
  BarChart3, Home, FileText, Info, Users, Share2, MinusCircle,
} from "lucide-react";
import { VestaBrandLogoMark } from "@/components/vesta-brand-logo";

// ── helpers ────────────────────────────────────────────────────────────────

function StatusPill({ status, locale }: { status: string; locale: "en" | "es" }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: locale === "es" ? "Pendiente" : "Pending", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    processing: { label: locale === "es" ? "En proceso" : "Processing", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completed:  { label: locale === "es" ? "Completado" : "Completed", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    failed:     { label: locale === "es" ? "Fallido" : "Failed", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const c = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.cls}`}>
      {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "completed"  && <CheckCircle2 className="h-3 w-3" />}
      {status === "failed"     && <AlertCircle className="h-3 w-3" />}
      {c.label}
    </span>
  );
}

function Section({ icon, title, children, accent }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <Card className={`glass-card-strong border-border ${accent ?? ""}`}>
      <CardHeader className="pb-4 pt-5 px-6">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="report-title text-[15px]">{title}</CardTitle>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="report-card-spacing pt-4">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string | number | null; highlight?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-border/40 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right ${highlight ? "text-primary" : "text-foreground"}`}>
        {String(value)}
      </span>
    </div>
  );
}

function textWithOpenStreetMapLink(text: string, mapUrl: string | undefined): React.ReactNode {
  if (!mapUrl || !text.includes("OpenStreetMap")) return text;
  const parts = text.split("OpenStreetMap");
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-90"
            >
              OpenStreetMap
            </a>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function BulletList({
  items,
  variant,
  openStreetMapUrl,
}: {
  items: string[];
  variant?: "check" | "warning" | "dot";
  /** When set, the substring "OpenStreetMap" in each item becomes a link to this map URL. */
  openStreetMapUrl?: string;
}) {
  const icon = variant === "check" ? "✓" : variant === "warning" ? "⚠" : "•";
  const color = variant === "check" ? "text-emerald-400" : variant === "warning" ? "text-amber-400" : "text-primary";
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          <span className={`${color} mt-0.5 shrink-0 font-bold`}>{icon}</span>
          <span>{openStreetMapUrl ? textWithOpenStreetMapLink(item, openStreetMapUrl) : item}</span>
        </li>
      ))}
    </ul>
  );
}

function RiskScore({ score, level, locale }: { score?: number; level?: string; locale: "en" | "es" }) {
  if (!score) return null;
  const color = score >= 70 ? "text-red-400" : score >= 40 ? "text-amber-400" : "text-emerald-400";
  const bg    = score >= 70 ? "bg-red-500/10" : score >= 40 ? "bg-amber-500/10" : "bg-emerald-500/10";
  return (
    <div className={`rounded-lg ${bg} px-4 py-3 flex items-center justify-between`}>
      <div>
        <p className="text-xs text-muted-foreground">{locale === "es" ? "Puntuación de riesgo" : "Risk score"}</p>
        <p className={`text-2xl font-bold ${color}`}>{score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
      </div>
      {level && (
        <span className={`text-sm font-semibold uppercase tracking-wide ${color}`}>{level}</span>
      )}
    </div>
  );
}

function formatEuroMaybe(v: unknown, locale: "en" | "es") {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `€${n.toLocaleString(locale === "es" ? "es-ES" : "en-GB")}`;
}

function LegalRiskBadge({ level, locale }: { level?: string; locale: "en" | "es" }) {
  if (!level) return null;
  const key = String(level).toLowerCase();
  const cfg =
    key === "high"
      ? { label: locale === "es" ? "ALTO" : "HIGH", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
      : key === "medium"
        ? { label: locale === "es" ? "MEDIO" : "MEDIUM", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
        : key === "low"
          ? { label: locale === "es" ? "BAJO" : "LOW", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
          : { label: key.toUpperCase(), cls: "bg-muted text-muted-foreground border-border" };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── main ──────────────────────────────────────────────────────────────────

export default function ReportDetail() {
  const [, params] = useRoute("/reports/:id");
  const [, navigate] = useHashLocation();
  const reportId = params ? parseInt(params.id) : null;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [pollEnabled, setPollEnabled] = useState(false);
  const [asyncReport, setAsyncReport] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const { locale } = useUiLocale();
  const tr = (en: string, es: string) => (locale === "es" ? es : en);
  const reportListStrings = getReportsStrings(locale);

  const { data: report, isLoading, refetch } = useQuery<Report>({
    queryKey: ["/api/reports", reportId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!reportId,
  });

  // Start polling when report is still processing
  useEffect(() => {
    if (report?.stripeJobId && (report.status === "processing" || report.status === "pending")) {
      setPollEnabled(true);
    }
    // If already completed with stored JSON, load it
    if (report?.reportJson && !asyncReport) {
      try { setAsyncReport(JSON.parse(report.reportJson)); } catch {}
    }
  }, [report]);

  // Poll job status
  useEffect(() => {
    if (!pollEnabled || !report?.stripeJobId) return;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      setElapsed(prev => prev + 4);
      try {
        const res = await apiRequest("GET", `/api/report/status/${report.stripeJobId}`);
        const data = await res.json();

        if (data.status === "completed" && data.report) {
          setAsyncReport(data.report);
          setPollEnabled(false);
          await apiRequest("PATCH", `/api/reports/${report.id}`, {
            status: "completed",
            reportJson: JSON.stringify(data.report),
          });
          qc.invalidateQueries({ queryKey: ["/api/reports"] });
          qc.invalidateQueries({ queryKey: ["/api/reports", reportId] });
        } else if (data.status === "failed" || attempts >= 45) {
          setPollEnabled(false);
          if (data.status === "failed") {
            await apiRequest("PATCH", `/api/reports/${report.id}`, { status: "failed" });
            qc.invalidateQueries({ queryKey: ["/api/reports", reportId] });
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [pollEnabled, report?.stripeJobId]);

  // Parse stored data
  const cadastral = (() => { try { return report?.cadastralJson ? JSON.parse(report.cadastralJson) : null; } catch { return null; } })();
  const financial  = (() => { try { return report?.financialJson ? JSON.parse(report.financialJson) : null; } catch { return null; } })();
  const notaSimple = (() => { try { return (report as any)?.notaSimpleJson ? JSON.parse((report as any).notaSimpleJson) : null; } catch { return null; } })();
  const fullReport = asyncReport ?? (() => { try { return report?.reportJson ? JSON.parse(report.reportJson) : null; } catch { return null; } })();
  const zoneAnalysis = fullReport?.zone_analysis ?? fullReport?.zoneAnalysis ?? null;
  const zoneOpenStreetMapUrl = (() => {
    const u = zoneAnalysis?.snapshot?.openstreetmap_url;
    return typeof u === "string" && u.startsWith("http") ? u : undefined;
  })();

  const reportType = String(report?.type || "").toLowerCase();
  const isExpertPackage = reportType === "expert_report";
  const isAnalysisPackage = reportType === "analysis_pack";
  const reportTypeLabel = isExpertPackage
    ? reportListStrings.typeExpertReport
    : isAnalysisPackage
      ? reportListStrings.typeAnalysisPack
      : reportListStrings.typeGenericPropertyReport;
  /** Hide order-flow + deliverables rubrics for paid map packages (15€ / 50€). */
  const hidePostPaymentAndDeliverables = isAnalysisPackage || isExpertPackage;
  const reportStatus = String(report?.status || "").toLowerCase();
  const expertNotaOnlyComplete =
    isExpertPackage &&
    reportStatus === "completed" &&
    Boolean(notaSimple) &&
    !fullReport;
  const isProcessing = (report?.status === "processing" || report?.status === "pending") && !fullReport;
  const isFailed = report?.status === "failed" && !fullReport;
  const timelineBase = hidePostPaymentAndDeliverables
    ? []
    : isExpertPackage
      ? [
          { label: tr("Payment confirmed", "Pago confirmado"), done: !!report },
          {
            label: tr(
              "Land registry summary request sent to collaborators",
              "Solicitud de Nota Simple enviada a colaboradores",
            ),
            done: !!report,
          },
          { label: tr("PDF received + legal OCR extracted", "PDF recibido + OCR legal extraído"), done: !!notaSimple },
          {
            label: tr(
              "Expert AI analysis in progress (risk, due diligence)",
              "Análisis IA experto en curso (riesgo, diligencia debida)",
            ),
            done: !!fullReport || expertNotaOnlyComplete,
          },
          {
            label: tr("Final report available in Reports", "Informe final disponible en Informes"),
            done: reportStatus === "completed" && (!!fullReport || !!notaSimple),
          },
        ]
      : [
          { label: tr("Payment confirmed", "Pago confirmado"), done: !!report },
          {
            label: tr("Analysis package registered", "Paquete de análisis registrado"),
            done: !!report && ["pending", "processing", "completed", "failed"].includes(reportStatus),
          },
          { label: tr("Report available in Reports", "Informe disponible en Informes"), done: reportStatus === "completed" || !!fullReport },
        ];
  const firstPendingTimelineStep = timelineBase.findIndex((step) => !step.done);
  const timelineSteps = timelineBase.map((step, idx) => ({
    ...step,
    active:
      firstPendingTimelineStep === -1
        ? idx === timelineBase.length - 1
        : idx === firstPendingTimelineStep,
  }));
  const deliverables: { label: string; ready: boolean; waived?: boolean }[] = hidePostPaymentAndDeliverables
    ? []
    : isExpertPackage
      ? [
          {
            label: tr(
              "Official land registry summary (owner, charges, legal risk)",
              "Nota Simple oficial (titular, cargas, riesgo legal)",
            ),
            ready: !!notaSimple,
          },
          {
            label: tr(
              "Expert AI report: executive summary, investment risk, due diligence",
              "Informe IA experto: resumen ejecutivo, riesgo de inversión, diligencia debida",
            ),
            ready: !!fullReport,
            waived: expertNotaOnlyComplete,
          },
          {
            label: tr("Complete sections: legal, urban planning, financials, neighborhood", "Secciones completas: legal, urbanismo, finanzas, barrio"),
            ready: !!fullReport,
            waived: expertNotaOnlyComplete,
          },
        ]
      : [
          { label: tr("Property financial analysis", "Análisis financiero de la propiedad"), ready: !!report },
          {
            label: tr(
              "Opportunity score, yield, ROI and valuation estimate",
              "Puntuación de oportunidad, rentabilidad, ROI y valoración estimada",
            ),
            ready: !!fullReport || !!financial,
          },
          {
            label: tr(
              "Available in Reports right after payment confirmation",
              "Disponible en Informes justo tras la confirmación de pago",
            ),
            ready: reportStatus === "completed" || !!fullReport,
          },
        ];
  const reportShareUrl =
    reportId && typeof window !== "undefined"
      ? `${window.location.origin}/#/reports/${reportId}`
      : `#/reports/${reportId ?? ""}`;
  const reportPdfUrl = (() => {
    const raw = report?.pdfUrl?.trim();
    if (!raw) return null;
    try {
      if (typeof window === "undefined") return raw;
      return new URL(raw, window.location.origin).toString();
    } catch {
      return raw;
    }
  })();
  const shareTitle = tr("Vesta AI property report", "Informe de propiedad Vesta AI");
  const handleNativeShare = async () => {
    if (!reportShareUrl) return;
    if (typeof navigator === "undefined" || !navigator.share) {
      toast({
        title: tr("Share not available", "Compartir no disponible"),
        description: tr("Your browser does not support native share.", "Tu navegador no soporta compartir de forma nativa."),
      });
      return;
    }
    try {
      await navigator.share({
        title: `${shareTitle} #${reportId ?? ""}`,
        text: tr("Sharing report from Vesta AI", "Compartiendo informe de Vesta AI"),
        url: reportShareUrl,
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      toast({
        title: tr("Share failed", "Error al compartir"),
        description: tr("Could not open the share dialog.", "No se pudo abrir el dialogo de compartir."),
        variant: "destructive",
      });
    }
  };

  if (!reportId) return <div className="p-6 text-center text-muted-foreground">{tr("Report not found.", "Informe no encontrado.")}</div>;

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto font-report">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/reports")} className="shrink-0 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="report-heading text-2xl md:text-[2rem] text-foreground">{reportTypeLabel}</h1>
            {report && <StatusPill status={report.status} locale={locale} />}
            {report && isReportDemoPreview(report) ? (
              <Badge variant="secondary" className="text-[11px] font-normal text-muted-foreground">
                {reportListStrings.reportDemoBadge}
              </Badge>
            ) : null}
            {report && (
              <Badge variant="outline" className="text-[11px]">
                {reportTypeLabel}
              </Badge>
            )}
          </div>
          <div className="report-aux-stack-mobile mt-1">
            {(report as any)?.referenciaCatastral && (
              <p className="text-xs text-muted-foreground font-mono">{(report as any).referenciaCatastral}</p>
            )}
            {(report as any)?.address && (
              <p className="report-secondary report-aux-mobile">{(report as any).address}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} title={tr("Refresh", "Actualizar")}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <Card key={i} className="report-card-spacing space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </Card>
          ))}
        </div>
      )}

      {/* Processing */}
      {!isLoading && isProcessing && (
        <Card className="glass-card-strong border-border">
          <CardContent className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {isExpertPackage
                  ? tr("Generating expert report", "Generando informe experto")
                  : tr("Preparing analysis package", "Preparando paquete de análisis")}
              </h3>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                {isExpertPackage ? (
                  <>
                    <p>
                      {tr(
                        "Land registry summary request · Land Registry validation",
                        "Solicitud de Nota Simple · validación registral",
                      )}
                    </p>
                    <p>{tr("AI legal analysis · Financial calculation", "Análisis legal IA · cálculo financiero")}</p>
                  </>
                ) : (
                  <>
                    <p>{tr("Payment confirmed · package registration", "Pago confirmado · registro de paquete")}</p>
                    <p>{tr("Result published in Reports", "Resultado publicado en Informes")}</p>
                  </>
                )}
              </div>
            </div>
            <div className="w-full max-w-xs">
              <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(95, (elapsed / 180) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {Math.floor(elapsed / 60) > 0 ? `${Math.floor(elapsed / 60)}m ` : ""}{elapsed % 60}s
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed */}
      {!isLoading && isFailed && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-foreground">{tr("Generation failed", "Generacion fallida")}</p>
            <Button variant="outline" onClick={() => navigate("/map")} className="gap-2">
              <MapPin className="h-4 w-4" /> {tr("Back to map", "Volver al mapa")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Post-payment timeline (hidden for analysis_pack / expert_report) */}
      {!isLoading && report && !hidePostPaymentAndDeliverables && (
        <Section icon={<Info className="h-4 w-4" />} title={tr("Post-payment process", "Proceso despues del pago")}>
          <div className="rounded-lg glass-panel p-4 space-y-2 md:space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground report-aux-mobile">
              {tr("Order flow", "Flujo del pedido")}
            </p>
            {timelineSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-2 text-xs">
                {step.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : step.active ? (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                )}
                <span className={step.done ? "text-foreground" : "text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Deliverables (hidden for analysis_pack / expert_report) */}
      {!isLoading && report && !hidePostPaymentAndDeliverables && (
        <Section icon={<FileText className="h-4 w-4" />} title={tr("What you receive", "Que recibes")}>
          <div className="rounded-lg glass-panel p-4 space-y-2 md:space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground report-aux-mobile">
              {tr("Package deliverables", "Entregables del paquete")}
            </p>
            {deliverables.map((item) => (
              <div key={item.label} className="flex items-start gap-2 text-xs">
                {item.ready ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : item.waived ? (
                  <MinusCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0 mt-0.5" />
                )}
                <span className={item.ready ? "text-foreground" : "text-muted-foreground"}>
                  {item.label}
                  {item.waived ? (
                    <span className="block text-[10px] text-muted-foreground/90 mt-0.5 font-normal">
                      {tr("Not included in this delivery.", "No incluido en esta entrega.")}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Catastro ─────────────────────────────────────────────────────── */}
      {!isLoading && cadastral && (
        <Section icon={<VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />} title={tr("Catastro data", "Datos de Catastro")}>
          {cadastral.referenciaCatastral && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tr("Reference", "Referencia")}</p>
              <p className="text-sm font-bold text-primary font-mono">{cadastral.referenciaCatastral}</p>
            </div>
          )}
          <Row label={tr("Address", "Direccion")} value={cadastral.address} />
          <Row label={tr("Municipality", "Municipio")} value={cadastral.municipio} />
          <Row label={tr("Province", "Provincia")} value={cadastral.provincia} />
          <Row label={tr("Area", "Superficie")} value={cadastral.superficie ? `${cadastral.superficie} m²` : null} />
          <Row label={tr("Use", "Uso")} value={cadastral.uso} />
          <Row label={tr("Construction year", "Ano de construccion")} value={cadastral.anoConstruccion} />
        </Section>
      )}

      {/* ── Financial ─────────────────────────────────────────────────────── */}
      {!isLoading && financial && Object.keys(financial).length > 0 && (
        <Section icon={<TrendingUp className="h-4 w-4" />} title={tr("Financial analysis", "Analisis financiero")}>
          <div className="grid grid-cols-2 gap-x-6">
            {financial.grossYield != null && <Row label={tr("Gross yield", "Rentabilidad bruta")} value={`${parseFloat(String(financial.grossYield)).toFixed(2)}%`} highlight />}
            {financial.netYield != null && <Row label={tr("Net yield", "Rentabilidad neta")} value={`${parseFloat(String(financial.netYield)).toFixed(2)}%`} highlight />}
            {financial.roi != null && <Row label="ROI" value={`${parseFloat(String(financial.roi)).toFixed(2)}%`} highlight />}
            {financial.opportunityScore != null && <Row label={tr("Opportunity score", "Puntuacion de oportunidad")} value={`${financial.opportunityScore}/100`} highlight />}
            {financial.pricePerSqm != null && <Row label={tr("Price/m²", "Precio/m²")} value={`€${parseFloat(String(financial.pricePerSqm)).toLocaleString()}`} />}
            {financial.estimatedValue != null && <Row label={tr("Estimated value", "Valor estimado")} value={`€${parseFloat(String(financial.estimatedValue)).toLocaleString()}`} />}
            {financial.monthlyRent != null && <Row label={tr("Monthly rent", "Alquiler mensual")} value={`€${parseFloat(String(financial.monthlyRent)).toLocaleString()}`} />}
          </div>
        </Section>
      )}

      {/* Zone / POI (analysis_pack merge sau raport demo/expert cu zona) — nu depinde de sectiunile AI */}
      {zoneAnalysis && (
        <Section icon={<MapPin className="h-4 w-4" />} title={tr("Zone analysis (MVP)", "Analisis de zona (MVP)")}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Row label={tr("City", "Ciudad")} value={zoneAnalysis.snapshot?.city} />
              <Row label={tr("District", "Distrito")} value={zoneAnalysis.snapshot?.district} />
              <Row label={tr("Area price band", "Rango de precios zona")} value={zoneAnalysis.snapshot?.price_band} />
              <Row
                label={tr("Average area price / m²", "Precio medio zona / m²")}
                value={
                  zoneAnalysis.snapshot?.market_price_per_m2 != null
                    ? `€${Number(zoneAnalysis.snapshot.market_price_per_m2).toLocaleString()}`
                    : null
                }
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <Row label={tr("Nearby schools", "Escuelas cercanas")} value={zoneAnalysis.nearby_essentials?.schools_nearby} />
              <Row label={tr("Nearby hospitals/clinics", "Hospitales/clinicas cercanas")} value={zoneAnalysis.nearby_essentials?.hospitals_nearby} />
              <Row label={tr("Nearby police", "Policia cercana")} value={zoneAnalysis.nearby_essentials?.police_nearby} />
              <Row label={tr("Nearby transit stops", "Paradas de transporte cercanas")} value={zoneAnalysis.nearby_essentials?.transit_stops_nearby} />
              <Row label={tr("Points of interest", "Puntos de interes")} value={zoneAnalysis.nearby_essentials?.attractions_nearby} />
            </div>
            {Array.isArray(zoneAnalysis.named_attractions) && zoneAnalysis.named_attractions.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {tr("Named attractions nearby", "Atracciones con nombre cercanas")}
                  </p>
                  {zoneAnalysis.named_attractions.map((a: { name?: string; kind?: string; distance_m?: number }, idx: number) => (
                    <Row
                      key={`${a.name ?? idx}-${idx}`}
                      label={a.name ?? "—"}
                      value={a.distance_m != null ? `~${a.distance_m} m${a.kind ? ` · ${a.kind}` : ""}` : a.kind ?? null}
                    />
                  ))}
                </div>
              </>
            )}
            <Separator />
            <div className="space-y-1">
              <Row label={tr("Safety score", "Puntuacion de seguridad")} value={zoneAnalysis.safety_liquidity?.safety_score != null ? `${zoneAnalysis.safety_liquidity.safety_score}/100` : null} />
              <Row label={tr("Liquidity score", "Puntuacion de liquidez")} value={zoneAnalysis.safety_liquidity?.liquidity_score != null ? `${zoneAnalysis.safety_liquidity.liquidity_score}/100` : null} />
              <Row label={tr("Risk level", "Nivel de riesgo")} value={zoneAnalysis.safety_liquidity?.risk_level} />
              <Row label={tr("Final opportunity score", "Puntuacion final de oportunidad")} value={zoneAnalysis.final_opportunity?.score != null ? `${zoneAnalysis.final_opportunity.score}/100` : null} highlight />
              {zoneAnalysis.safety_liquidity?.summary && (
                <p className="report-secondary text-xs pt-1">{zoneAnalysis.safety_liquidity.summary}</p>
              )}
            </div>
            {Array.isArray(zoneAnalysis.poi_attractiveness?.highlights) && zoneAnalysis.poi_attractiveness.highlights.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">{tr("Area highlights", "Fortalezas de la zona")}</p>
                <BulletList
                  items={zoneAnalysis.poi_attractiveness.highlights}
                  variant="check"
                  openStreetMapUrl={zoneOpenStreetMapUrl}
                />
              </div>
            )}
            {Array.isArray(zoneAnalysis.poi_attractiveness?.cautions) && zoneAnalysis.poi_attractiveness.cautions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">{tr("Notes", "Observaciones")}</p>
                <BulletList
                  items={zoneAnalysis.poi_attractiveness.cautions}
                  variant="warning"
                  openStreetMapUrl={zoneOpenStreetMapUrl}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Nota Simple structured data ─────────────────────────────────────── */}
      {!isLoading && notaSimple && (
        <Section
          icon={<Scale className="h-4 w-4" />}
          title={tr("Data extracted from land registry summary", "Datos extraídos de la Nota Simple")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg glass-panel p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{tr("Owner", "Titular")}</p>
                <Row
                  label={tr("Holder", "Titular")}
                  value={
                    notaSimple?.structured?.owner?.names?.length
                      ? notaSimple.structured.owner.names.join(", ")
                      : notaSimple?.titular
                  }
                />
                <Row label={tr("Ownership type", "Tipo de titularidad")} value={notaSimple?.structured?.owner?.ownership_type} />
                <Row label={tr("Ownership share", "Cuota")} value={notaSimple?.structured?.owner?.ownership_share} />
              </div>
              <div className="rounded-lg glass-panel p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{tr("Property details", "Datos del inmueble")}</p>
                <Row label={tr("Address", "Direccion")} value={notaSimple?.structured?.property?.address || notaSimple?.direccion} />
                <Row label={tr("Property type", "Tipo de inmueble")} value={notaSimple?.structured?.property?.property_type} />
                <Row label="IDUFIR/CRU" value={notaSimple?.structured?.property?.idufir_cru} />
                <Row label={tr("Registry reference", "Referencia registral")} value={notaSimple?.structured?.property?.registry_reference} />
                <Row label={tr("Cadastral reference", "Referencia catastral")} value={notaSimple?.structured?.property?.cadastral_reference} />
                <Row label={tr("Built area", "Superficie construida")} value={notaSimple?.structured?.property?.built_area_m2 ? `${notaSimple.structured.property.built_area_m2} m²` : null} />
                <Row label={tr("Usable area", "Superficie util")} value={notaSimple?.structured?.property?.usable_area_m2 ? `${notaSimple.structured.property.usable_area_m2} m²` : null} />
              </div>
            </div>

            <div className="rounded-lg glass-panel p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{tr("Debts and encumbrances", "Deudas y cargas")}</p>
              <Row label={tr("Summary", "Resumen")} value={notaSimple?.cargas} />
              <Row label={tr("Encumbrance expiry", "Caducidad de cargas")} value={notaSimple?.caducidad_cargas} />
              <Row
                label={tr("Known total", "Total conocido")}
                value={formatEuroMaybe(notaSimple?.structured?.debts?.total_known_amount_eur, locale)}
              />
              <Row
                label={tr("Has active debts", "Tiene deudas activas")}
                value={
                  typeof notaSimple?.structured?.debts?.has_active_debts === "boolean"
                    ? (notaSimple.structured.debts.has_active_debts
                        ? tr("Yes", "Sí")
                        : tr("No", "No"))
                    : null
                }
              />
              {Array.isArray(notaSimple?.structured?.debts?.items) &&
                notaSimple.structured.debts.items.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {notaSimple.structured.debts.items.map((item: any, idx: number) => (
                      <div key={idx} className="rounded glass-panel px-3 py-2 text-xs">
                        <p className="font-semibold text-foreground">
                          {(item.type || tr("Encumbrance", "Carga")).toString().toUpperCase()}
                        </p>
                        <p className="text-muted-foreground">
                          {[item.creditor, formatEuroMaybe(item.amount_eur, locale), item.rank].filter(Boolean).join(" · ")}
                        </p>
                        {item.maturity_or_expiry_date && (
                          <p className="text-muted-foreground">{tr("Maturity/expiry", "Vencimiento/caducidad")}: {item.maturity_or_expiry_date}</p>
                        )}
                        {item.notes && <p className="text-muted-foreground">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="rounded-lg glass-panel p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{tr("Legal risk", "Riesgo legal")}</p>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-xs text-muted-foreground">{tr("Risk level", "Nivel de riesgo")}</span>
                <LegalRiskBadge level={notaSimple?.structured?.risk?.legal_risk_level} locale={locale} />
              </div>
              {Array.isArray(notaSimple?.structured?.risk?.legal_risk_reasons) &&
                notaSimple.structured.risk.legal_risk_reasons.length > 0 && (
                  <BulletList items={notaSimple.structured.risk.legal_risk_reasons} variant="warning" />
                )}
              {notaSimple?.embargo_caducado && (
                <p className="text-xs text-amber-400 mt-2">{tr("Expired embargo detected: legal verification required.", "Embargo caducado detectado: se requiere revision legal.")}</p>
              )}
              {notaSimple?.manual_check && (
                <p className="text-xs text-amber-400 mt-1">{tr("Document requires manual verification (low-confidence OCR).", "El documento requiere revision manual (OCR de baja confianza).")}</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Full AI Report sections ────────────────────────────────────────── */}
      {fullReport && (
        <>
          {/* Executive Summary */}
          {fullReport.executive_summary && (
            <Section icon={<FileText className="h-4 w-4" />} title={tr("Executive summary", "Resumen ejecutivo")}>
              <p className="report-secondary report-aux-mobile">{fullReport.executive_summary}</p>
            </Section>
          )}

          {/* Risk */}
          {fullReport.risk && (
            <Section icon={<ShieldAlert className="h-4 w-4" />} title={tr("Investment risk", "Riesgo de inversion")} accent="border-amber-500/20">
              <div className="space-y-3">
                <RiskScore score={fullReport.risk.score} level={fullReport.risk.level} locale={locale} />
                {fullReport.risk.drivers?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">{tr("Risk drivers", "Factores de riesgo")}</p>
                    <BulletList items={fullReport.risk.drivers} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Legal / Nota Simple */}
          {fullReport.legal && (
            <Section
              icon={<Scale className="h-4 w-4" />}
              title={tr("Legal situation — land registry summary", "Situación legal — Nota Simple")}
            >
              <div className="space-y-4">
                {fullReport.legal.summary && (
                  <p className="report-secondary report-aux-mobile">{fullReport.legal.summary}</p>
                )}
                {fullReport.legal.active_mortgages?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{tr("Active mortgages", "Hipotecas activas")}</p>
                    <BulletList items={fullReport.legal.active_mortgages} variant="warning" />
                  </div>
                )}
                {fullReport.legal.encumbrances?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{tr("Encumbrances", "Cargas")}</p>
                    <BulletList items={fullReport.legal.encumbrances} variant="warning" />
                  </div>
                )}
                {fullReport.legal.red_flags?.length > 0 && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">⚠ {tr("Legal alerts", "Alertas legales")}</p>
                    <BulletList items={fullReport.legal.red_flags} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Financials from AI */}
          {fullReport.financials && (
            <Section icon={<BarChart3 className="h-4 w-4" />} title={tr("AI financial evaluation", "Evaluacion financiera IA")}>
              <div className="space-y-1">
                {fullReport.financials.market_value_min != null && fullReport.financials.market_value_max != null && (
                  <Row label={tr("Market value", "Valor de mercado")} value={`€${fullReport.financials.market_value_min?.toLocaleString()} – €${fullReport.financials.market_value_max?.toLocaleString()}`} highlight />
                )}
                {fullReport.financials.expected_rent_min != null && (
                  <Row label={tr("Expected rent", "Alquiler esperado")} value={`€${fullReport.financials.expected_rent_min?.toLocaleString()} – €${fullReport.financials.expected_rent_max?.toLocaleString()}${tr("/month", "/mes")}`} />
                )}
                {fullReport.financials.gross_yield_percent != null && (
                  <Row label={tr("Gross yield", "Rentabilidad bruta")} value={`${fullReport.financials.gross_yield_percent}%`} highlight />
                )}
                {fullReport.financials.roi_5_years_percent != null && (
                  <Row label={tr("5-year ROI", "ROI a 5 anos")} value={`${fullReport.financials.roi_5_years_percent}%`} highlight />
                )}
                {fullReport.financials.price_per_m2_zone != null && (
                  <Row label={tr("Area price/m²", "Precio zona/m²")} value={`€${fullReport.financials.price_per_m2_zone?.toLocaleString()}`} />
                )}
                {fullReport.financials.price_per_m2_ai_estimate != null && (
                  <Row label={tr("AI-estimated price/m²", "Precio estimado IA/m²")} value={`€${fullReport.financials.price_per_m2_ai_estimate?.toLocaleString()}`} />
                )}
                {fullReport.financials.valuation_confidence_score != null && (
                  <Row label={tr("Valuation confidence score", "Confianza de valoracion")} value={`${fullReport.financials.valuation_confidence_score}/100`} />
                )}
              </div>
            </Section>
          )}

          {/* Urbanism */}
          {fullReport.urbanism && (
            <Section icon={<Home className="h-4 w-4" />} title={tr("Urbanism", "Urbanismo")}>
              <div className="space-y-1">
                {fullReport.urbanism.comment && (
                  <p className="report-secondary report-aux-mobile mb-3">{fullReport.urbanism.comment}</p>
                )}
                <Row label={tr("Registered area", "Superficie registrada")} value={fullReport.urbanism.registered_built_m2 ? `${fullReport.urbanism.registered_built_m2} m²` : null} />
                <Row label={tr("Estimated area", "Superficie estimada")} value={fullReport.urbanism.estimated_built_m2 ? `${fullReport.urbanism.estimated_built_m2} m²` : null} />
                <Row label={tr("Discrepancy", "Discrepancia")} value={fullReport.urbanism.discrepancy_percent ? `${fullReport.urbanism.discrepancy_percent}%` : null} />
                {fullReport.urbanism.suspected_illegal_works && (
                  <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 font-medium">
                    ⚠ {tr("Potential unauthorized works detected", "Posibles obras no autorizadas detectadas")}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Neighborhood */}
          {fullReport.neighborhood && (
            <Section icon={<Users className="h-4 w-4" />} title={tr("Neighborhood analysis", "Analisis del barrio")}>
              <div className="grid grid-cols-2 gap-4">
                {fullReport.neighborhood.pros?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">{tr("Pros", "Ventajas")}</p>
                    <BulletList items={fullReport.neighborhood.pros} variant="check" />
                  </div>
                )}
                {fullReport.neighborhood.cons?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">{tr("Cons", "Desventajas")}</p>
                    <BulletList items={fullReport.neighborhood.cons} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Share actions */}
      {!isLoading && report && report.status === "completed" && (
        <Section icon={<Share2 className="h-4 w-4" />} title={tr("Share report", "Compartir informe")}>
          <div className="rounded-lg glass-panel p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {tr(
                "Use your device share sheet to send the report link.",
                "Usa la hoja de compartir del dispositivo para enviar el enlace del informe.",
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={handleNativeShare}>
                <Share2 className="h-4 w-4" />
                {tr("Share", "Compartir")}
              </Button>
            </div>
            <div className="space-y-1 text-xs break-all">
              <p className="text-muted-foreground">
                {tr("Report link", "Enlace del informe")}:{" "}
                <span className="text-foreground">{reportShareUrl}</span>
              </p>
              {reportPdfUrl && (
                <p className="text-muted-foreground">
                  {tr("PDF link", "Enlace PDF")}:{" "}
                  <span className="text-foreground">{reportPdfUrl}</span>
                </p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Completion */}
      {report?.status === "completed" && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground border-t border-border">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {tr("Report complete", "Informe completado")} · #{report.id}
        </div>
      )}
    </div>
  );
}
