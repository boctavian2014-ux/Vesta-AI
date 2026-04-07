import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";
import {
  ArrowLeft, Building2, TrendingUp, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, MapPin, Scale, ShieldAlert,
  BarChart3, Home, FileText, Info, Users,
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "În așteptare", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    processing: { label: "Se procesează", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completed:  { label: "Finalizat",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    failed:     { label: "Eșuat",        cls: "bg-red-500/15 text-red-400 border-red-500/30" },
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
    <Card className={`border-border ${accent ?? ""}`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="px-5 py-4">{children}</CardContent>
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

function BulletList({ items, variant }: { items: string[]; variant?: "check" | "warning" | "dot" }) {
  const icon = variant === "check" ? "✓" : variant === "warning" ? "⚠" : "•";
  const color = variant === "check" ? "text-emerald-400" : variant === "warning" ? "text-amber-400" : "text-primary";
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          <span className={`${color} mt-0.5 shrink-0 font-bold`}>{icon}</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function RiskScore({ score, level }: { score?: number; level?: string }) {
  if (!score) return null;
  const color = score >= 70 ? "text-red-400" : score >= 40 ? "text-amber-400" : "text-emerald-400";
  const bg    = score >= 70 ? "bg-red-500/10" : score >= 40 ? "bg-amber-500/10" : "bg-emerald-500/10";
  return (
    <div className={`rounded-lg ${bg} px-4 py-3 flex items-center justify-between`}>
      <div>
        <p className="text-xs text-muted-foreground">Scor risc</p>
        <p className={`text-2xl font-bold ${color}`}>{score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
      </div>
      {level && (
        <span className={`text-sm font-semibold uppercase tracking-wide ${color}`}>{level}</span>
      )}
    </div>
  );
}

function formatEuroMaybe(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `€${n.toLocaleString("ro-RO")}`;
}

function LegalRiskBadge({ level }: { level?: string }) {
  if (!level) return null;
  const key = String(level).toLowerCase();
  const cfg =
    key === "high"
      ? { label: "HIGH", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
      : key === "medium"
        ? { label: "MEDIUM", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
        : key === "low"
          ? { label: "LOW", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
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

  const isProcessing = (report?.status === "processing" || report?.status === "pending") && !fullReport;
  const isFailed = report?.status === "failed" && !fullReport;

  if (!reportId) return <div className="p-6 text-center text-muted-foreground">Raport negăsit.</div>;

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/reports")} className="shrink-0 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">Raport Proprietate</h1>
            {report && <StatusPill status={report.status} />}
          </div>
          {(report as any)?.referenciaCatastral && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">{(report as any).referenciaCatastral}</p>
          )}
          {(report as any)?.address && (
            <p className="text-sm text-muted-foreground mt-0.5">{(report as any).address}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Reîncarcă">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <Card key={i} className="p-5 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </Card>
          ))}
        </div>
      )}

      {/* Processing */}
      {!isLoading && isProcessing && (
        <Card className="border-border">
          <CardContent className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Se generează raportul</h3>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Cerere Nota Simplă · Verificare Registro</p>
                <p>Analiză juridică AI · Calcul financiar</p>
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
            <p className="text-sm font-semibold text-foreground">Generare eșuată</p>
            <Button variant="outline" onClick={() => navigate("/map")} className="gap-2">
              <MapPin className="h-4 w-4" /> Înapoi la hartă
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Catastro ─────────────────────────────────────────────────────── */}
      {!isLoading && cadastral && (
        <Section icon={<Building2 className="h-4 w-4" />} title="Date Catastro">
          {cadastral.referenciaCatastral && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Referință</p>
              <p className="text-sm font-bold text-primary font-mono">{cadastral.referenciaCatastral}</p>
            </div>
          )}
          <Row label="Adresă" value={cadastral.address} />
          <Row label="Municipiu" value={cadastral.municipio} />
          <Row label="Provincie" value={cadastral.provincia} />
          <Row label="Suprafață" value={cadastral.superficie ? `${cadastral.superficie} m²` : null} />
          <Row label="Utilizare" value={cadastral.uso} />
          <Row label="An construcție" value={cadastral.anoConstruccion} />
        </Section>
      )}

      {/* ── Financial ─────────────────────────────────────────────────────── */}
      {!isLoading && financial && Object.keys(financial).length > 0 && (
        <Section icon={<TrendingUp className="h-4 w-4" />} title="Analiză Financiară">
          <div className="grid grid-cols-2 gap-x-6">
            {financial.grossYield != null && <Row label="Randament brut" value={`${parseFloat(String(financial.grossYield)).toFixed(2)}%`} highlight />}
            {financial.netYield != null && <Row label="Randament net" value={`${parseFloat(String(financial.netYield)).toFixed(2)}%`} highlight />}
            {financial.roi != null && <Row label="ROI" value={`${parseFloat(String(financial.roi)).toFixed(2)}%`} highlight />}
            {financial.opportunityScore != null && <Row label="Scor oportunitate" value={`${financial.opportunityScore}/100`} highlight />}
            {financial.pricePerSqm != null && <Row label="Preț/m²" value={`€${parseFloat(String(financial.pricePerSqm)).toLocaleString()}`} />}
            {financial.estimatedValue != null && <Row label="Valoare estimată" value={`€${parseFloat(String(financial.estimatedValue)).toLocaleString()}`} />}
            {financial.monthlyRent != null && <Row label="Chirie lunară" value={`€${parseFloat(String(financial.monthlyRent)).toLocaleString()}`} />}
          </div>
        </Section>
      )}

      {/* ── Nota Simple structured data ─────────────────────────────────────── */}
      {!isLoading && notaSimple && (
        <Section icon={<Scale className="h-4 w-4" />} title="Date extrase din Nota Simple">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proprietar</p>
                <Row
                  label="Titular"
                  value={
                    notaSimple?.structured?.owner?.names?.length
                      ? notaSimple.structured.owner.names.join(", ")
                      : notaSimple?.titular
                  }
                />
                <Row label="Tip proprietate" value={notaSimple?.structured?.owner?.ownership_type} />
                <Row label="Cotă" value={notaSimple?.structured?.owner?.ownership_share} />
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Caracteristici imobil</p>
                <Row label="Adresă" value={notaSimple?.structured?.property?.address || notaSimple?.direccion} />
                <Row label="Tip imobil" value={notaSimple?.structured?.property?.property_type} />
                <Row label="IDUFIR/CRU" value={notaSimple?.structured?.property?.idufir_cru} />
                <Row label="Ref. registru" value={notaSimple?.structured?.property?.registry_reference} />
                <Row label="Ref. cadastrală" value={notaSimple?.structured?.property?.cadastral_reference} />
                <Row label="Suprafață construită" value={notaSimple?.structured?.property?.built_area_m2 ? `${notaSimple.structured.property.built_area_m2} m²` : null} />
                <Row label="Suprafață utilă" value={notaSimple?.structured?.property?.usable_area_m2 ? `${notaSimple.structured.property.usable_area_m2} m²` : null} />
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Datorii și sarcini</p>
              <Row label="Rezumat" value={notaSimple?.cargas} />
              <Row label="Caducitate sarcini" value={notaSimple?.caducidad_cargas} />
              <Row
                label="Total cunoscut"
                value={formatEuroMaybe(notaSimple?.structured?.debts?.total_known_amount_eur)}
              />
              <Row
                label="Are datorii active"
                value={
                  typeof notaSimple?.structured?.debts?.has_active_debts === "boolean"
                    ? (notaSimple.structured.debts.has_active_debts ? "Da" : "Nu")
                    : null
                }
              />
              {Array.isArray(notaSimple?.structured?.debts?.items) &&
                notaSimple.structured.debts.items.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {notaSimple.structured.debts.items.map((item: any, idx: number) => (
                      <div key={idx} className="rounded border border-border/60 px-3 py-2 text-xs">
                        <p className="font-semibold text-foreground">
                          {(item.type || "Sarcină").toString().toUpperCase()}
                        </p>
                        <p className="text-muted-foreground">
                          {[item.creditor, formatEuroMaybe(item.amount_eur), item.rank].filter(Boolean).join(" · ")}
                        </p>
                        {item.maturity_or_expiry_date && (
                          <p className="text-muted-foreground">Scadență/caducitate: {item.maturity_or_expiry_date}</p>
                        )}
                        {item.notes && <p className="text-muted-foreground">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Risc juridic</p>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-xs text-muted-foreground">Nivel risc</span>
                <LegalRiskBadge level={notaSimple?.structured?.risk?.legal_risk_level} />
              </div>
              {Array.isArray(notaSimple?.structured?.risk?.legal_risk_reasons) &&
                notaSimple.structured.risk.legal_risk_reasons.length > 0 && (
                  <BulletList items={notaSimple.structured.risk.legal_risk_reasons} variant="warning" />
                )}
              {notaSimple?.embargo_caducado && (
                <p className="text-xs text-amber-400 mt-2">Embargo caducat detectat: necesită verificare juridică.</p>
              )}
              {notaSimple?.manual_check && (
                <p className="text-xs text-amber-400 mt-1">Documentul necesită verificare manuală (OCR low-confidence).</p>
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
            <Section icon={<FileText className="h-4 w-4" />} title="Rezumat Executiv">
              <p className="text-sm text-foreground leading-relaxed">{fullReport.executive_summary}</p>
            </Section>
          )}

          {/* Risk */}
          {fullReport.risk && (
            <Section icon={<ShieldAlert className="h-4 w-4" />} title="Risc Investițional" accent="border-amber-500/20">
              <div className="space-y-3">
                <RiskScore score={fullReport.risk.score} level={fullReport.risk.level} />
                {fullReport.risk.drivers?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Factori de risc</p>
                    <BulletList items={fullReport.risk.drivers} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Legal / Nota Simple */}
          {fullReport.legal && (
            <Section icon={<Scale className="h-4 w-4" />} title="Situație Juridică — Nota Simplă">
              <div className="space-y-4">
                {fullReport.legal.summary && (
                  <p className="text-sm text-foreground leading-relaxed">{fullReport.legal.summary}</p>
                )}
                {fullReport.legal.active_mortgages?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ipoteci active</p>
                    <BulletList items={fullReport.legal.active_mortgages} variant="warning" />
                  </div>
                )}
                {fullReport.legal.encumbrances?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sarcini</p>
                    <BulletList items={fullReport.legal.encumbrances} variant="warning" />
                  </div>
                )}
                {fullReport.legal.red_flags?.length > 0 && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">⚠ Alerte juridice</p>
                    <BulletList items={fullReport.legal.red_flags} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Financials from AI */}
          {fullReport.financials && (
            <Section icon={<BarChart3 className="h-4 w-4" />} title="Evaluare AI Financiară">
              <div className="space-y-1">
                {fullReport.financials.market_value_min != null && fullReport.financials.market_value_max != null && (
                  <Row label="Valoare de piață" value={`€${fullReport.financials.market_value_min?.toLocaleString()} – €${fullReport.financials.market_value_max?.toLocaleString()}`} highlight />
                )}
                {fullReport.financials.expected_rent_min != null && (
                  <Row label="Chirie așteptată" value={`€${fullReport.financials.expected_rent_min?.toLocaleString()} – €${fullReport.financials.expected_rent_max?.toLocaleString()}/lună`} />
                )}
                {fullReport.financials.gross_yield_percent != null && (
                  <Row label="Randament brut" value={`${fullReport.financials.gross_yield_percent}%`} highlight />
                )}
                {fullReport.financials.roi_5_years_percent != null && (
                  <Row label="ROI 5 ani" value={`${fullReport.financials.roi_5_years_percent}%`} highlight />
                )}
                {fullReport.financials.price_per_m2_zone != null && (
                  <Row label="Preț/m² zonă" value={`€${fullReport.financials.price_per_m2_zone?.toLocaleString()}`} />
                )}
                {fullReport.financials.price_per_m2_ai_estimate != null && (
                  <Row label="Preț/m² estimat AI" value={`€${fullReport.financials.price_per_m2_ai_estimate?.toLocaleString()}`} />
                )}
                {fullReport.financials.valuation_confidence_score != null && (
                  <Row label="Scor încredere evaluare" value={`${fullReport.financials.valuation_confidence_score}/100`} />
                )}
              </div>
            </Section>
          )}

          {/* Urbanism */}
          {fullReport.urbanism && (
            <Section icon={<Home className="h-4 w-4" />} title="Urbanism">
              <div className="space-y-1">
                {fullReport.urbanism.comment && (
                  <p className="text-sm text-foreground leading-relaxed mb-3">{fullReport.urbanism.comment}</p>
                )}
                <Row label="Suprafață înregistrată" value={fullReport.urbanism.registered_built_m2 ? `${fullReport.urbanism.registered_built_m2} m²` : null} />
                <Row label="Suprafață estimată" value={fullReport.urbanism.estimated_built_m2 ? `${fullReport.urbanism.estimated_built_m2} m²` : null} />
                <Row label="Discrepanță" value={fullReport.urbanism.discrepancy_percent ? `${fullReport.urbanism.discrepancy_percent}%` : null} />
                {fullReport.urbanism.suspected_illegal_works && (
                  <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 font-medium">
                    ⚠ Posibile lucrări neautorizate detectate
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Neighborhood */}
          {fullReport.neighborhood && (
            <Section icon={<Users className="h-4 w-4" />} title="Analiză Cartier">
              <div className="grid grid-cols-2 gap-4">
                {fullReport.neighborhood.pros?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Avantaje</p>
                    <BulletList items={fullReport.neighborhood.pros} variant="check" />
                  </div>
                )}
                {fullReport.neighborhood.cons?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Dezavantaje</p>
                    <BulletList items={fullReport.neighborhood.cons} variant="warning" />
                  </div>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Completion */}
      {report?.status === "completed" && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground border-t border-border">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          Raport complet · #{report.id}
        </div>
      )}
    </div>
  );
}
