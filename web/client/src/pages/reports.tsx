import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useHashLocation } from "wouter/use-hash-location";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Report } from "@shared/schema";
import { getReportsStrings } from "@/lib/reports-i18n";
import type { AppLocale } from "@/lib/locale";
import { detectBrowserLocale } from "@/lib/locale";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Map,
  ArrowRight,
  CalendarDays,
} from "lucide-react";

function StatusBadge({
  status,
  s,
}: {
  status: string;
  s: ReturnType<typeof getReportsStrings>;
}) {
  const configs: Record<
    string,
    {
      label: string;
      className: string;
      icon: React.ReactNode;
    }
  > = {
    pending: {
      label: s.statusPending,
      className:
        "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
      icon: <Clock className="h-3 w-3" />,
    },
    processing: {
      label: s.statusProcessing,
      className:
        "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    paid: {
      label: s.statusPaid,
      className:
        "bg-violet-500/15 text-violet-400 border-violet-500/30 hover:bg-violet-500/20",
      icon: <Clock className="h-3 w-3" />,
    },
    submitted_manual: {
      label: s.statusSubmittedManual,
      className:
        "bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/20",
      icon: <Clock className="h-3 w-3" />,
    },
    waiting_partner: {
      label: s.statusWaitingPartner,
      className:
        "bg-indigo-500/15 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20",
      icon: <Clock className="h-3 w-3" />,
    },
    pdf_received: {
      label: s.statusPdfReceived,
      className:
        "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20",
      icon: <FileText className="h-3 w-3" />,
    },
    completed: {
      label: s.statusCompleted,
      className:
        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: s.statusFailed,
      className:
        "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
      icon: <XCircle className="h-3 w-3" />,
    },
    failed_refundable: {
      label: s.statusFailedRefundable,
      className:
        "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/20",
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const config = configs[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground border-border",
    icon: null,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function ReportTypeLabel({
  type,
  s,
}: {
  type: string;
  s: ReturnType<typeof getReportsStrings>;
}) {
  const labels: Record<string, string> = {
    analysis_pack: s.typeAnalysisPack,
    nota_simple: s.typeNotaSimple,
    expert_report: s.typeExpertReport,
  };
  return (
    <Badge variant="outline" className="text-xs">
      {labels[type] ?? type}
    </Badge>
  );
}

function formatDate(dateStr: string, locale: AppLocale) {
  const tag = locale === "es" ? "es-ES" : "en-GB";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(tag, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function ReportSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="report-card-spacing">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard({
  report,
  s,
  locale,
}: {
  report: Report;
  s: ReturnType<typeof getReportsStrings>;
  locale: AppLocale;
}) {
  return (
    <Link href={`/reports/${report.id}`}>
      <Card
        className="border-border hover:border-primary/30 transition-colors cursor-pointer"
        data-testid={`report-card-${report.id}`}
      >
        <CardContent className="report-card-spacing">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ReportTypeLabel type={report.type} s={s} />
                <StatusBadge status={report.status} s={s} />
              </div>
              {(report as any).address && (
                <p className="text-xs text-foreground mt-1.5 font-medium truncate">{(report as any).address}</p>
              )}
              {(report as any).referenciaCatastral && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{(report as any).referenciaCatastral}</p>
              )}
              <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-1.5 text-xs text-muted-foreground report-aux-mobile">
                <CalendarDays className="h-3 w-3" />
                <span>{formatDate(report.createdAt, locale)}</span>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ s }: { s: ReturnType<typeof getReportsStrings> }) {
  const [, navigate] = useHashLocation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="p-4 rounded-full bg-muted">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          {s.emptyTitle}
        </h3>
        <p className="report-secondary report-aux-mobile max-w-xs">
          {s.emptyDescription}
        </p>
      </div>
      <Button
        onClick={() => navigate("/map")}
        className="gap-2"
        data-testid="go-to-map-reports"
      >
        <Map className="h-4 w-4" />
        {s.analyzeProperty}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

const STATUS_ORDER = [
  "processing",
  "pending",
  "paid",
  "submitted_manual",
  "waiting_partner",
  "pdf_received",
  "completed",
  "failed_refundable",
  "failed",
];

export default function Reports() {
  const locale = detectBrowserLocale();
  const s = getReportsStrings(locale);

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const counts = reports?.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const countSubtitle =
    !isLoading && reports
      ? `${reports.length} ${reports.length !== 1 ? s.reportsCount : s.reportsCountOne}`
      : s.reportsSubtitleLoading;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto font-report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="report-heading text-2xl md:text-[2rem] text-foreground">{s.reportsTitle}</h1>
          <p className="report-secondary report-aux-mobile mt-1 tracking-[-0.005em]">{countSubtitle}</p>
        </div>

        {counts && (
          <div className="flex items-center gap-2 flex-wrap">
            {counts.processing && (
              <span className="text-xs text-blue-400">
                {counts.processing} {s.countProcessing}
              </span>
            )}
            {counts.pending && (
              <span className="text-xs text-amber-400">
                {counts.pending} {s.countPending}
              </span>
            )}
            {counts.paid && (
              <span className="text-xs text-violet-400">
                {counts.paid} {s.countPaid}
              </span>
            )}
            {counts.submitted_manual && (
              <span className="text-xs text-sky-400">
                {counts.submitted_manual} {s.countSubmittedManual}
              </span>
            )}
            {counts.waiting_partner && (
              <span className="text-xs text-indigo-400">
                {counts.waiting_partner} {s.countWaitingPartner}
              </span>
            )}
            {counts.pdf_received && (
              <span className="text-xs text-cyan-400">
                {counts.pdf_received} {s.countPdfReceived}
              </span>
            )}
            {counts.completed && (
              <span className="text-xs text-emerald-400">
                {counts.completed} {s.countCompleted}
              </span>
            )}
            {counts.failed_refundable && (
              <span className="text-xs text-rose-400">
                {counts.failed_refundable} {s.countFailedRefundable}
              </span>
            )}
            {counts.failed && (
              <span className="text-xs text-red-400">
                {counts.failed} {s.countFailed}
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ReportSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && (!reports || reports.length === 0) && <EmptyState s={s} />}

      {!isLoading && reports && reports.length > 0 && (
        <div className="space-y-3" data-testid="reports-list">
          {[...reports]
            .sort(
              (a, b) =>
                STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
            )
            .map((report) => (
              <ReportCard key={report.id} report={report} s={s} locale={locale} />
            ))}
        </div>
      )}
    </div>
  );
}
