import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useHashLocation } from "wouter/use-hash-location";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { Report } from "@shared/schema";
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

function StatusBadge({ status }: { status: string }) {
  const configs: Record<
    string,
    {
      label: string;
      className: string;
      icon: React.ReactNode;
    }
  > = {
    pending: {
      label: "Pending",
      className:
        "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
      icon: <Clock className="h-3 w-3" />,
    },
    processing: {
      label: "Processing",
      className:
        "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    completed: {
      label: "Completed",
      className:
        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      className:
        "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
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

function ReportTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    nota_simple: "Nota Simple",
    expert_report: "Expert Report",
  };
  return (
    <Badge variant="outline" className="text-xs">
      {labels[type] ?? type}
    </Badge>
  );
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
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
      <CardContent className="p-4">
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

function ReportCard({ report }: { report: Report }) {
  return (
    <Link href={`/reports/${report.id}`}>
      <Card
        className="border-border hover:border-primary/30 transition-colors cursor-pointer"
        data-testid={`report-card-${report.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ReportTypeLabel type={report.type} />
                <StatusBadge status={report.status} />
              </div>
              {(report as any).address && (
                <p className="text-xs text-foreground mt-1.5 font-medium truncate">{(report as any).address}</p>
              )}
              {(report as any).referenciaCatastral && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{(report as any).referenciaCatastral}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                <span>{formatDate(report.createdAt)}</span>
              </div>
            </div>

            {/* Arrow */}
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState() {
  const [, navigate] = useHashLocation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="p-4 rounded-full bg-muted">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No reports yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Order your first property report by analyzing a property on the map.
        </p>
      </div>
      <Button
        onClick={() => navigate("/map")}
        className="gap-2"
        data-testid="go-to-map-reports"
      >
        <Map className="h-4 w-4" />
        Analyze a Property
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

const STATUS_ORDER = ["processing", "pending", "completed", "failed"];

export default function Reports() {
  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Group by status for counting
  const counts = reports?.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {!isLoading && reports
              ? `${reports.length} report${reports.length !== 1 ? "s" : ""} ordered`
              : "Your property reports"}
          </p>
        </div>

        {/* Status summary badges */}
        {counts && (
          <div className="flex items-center gap-2 flex-wrap">
            {counts.processing && (
              <span className="text-xs text-blue-400">
                {counts.processing} processing
              </span>
            )}
            {counts.pending && (
              <span className="text-xs text-amber-400">
                {counts.pending} pending
              </span>
            )}
            {counts.completed && (
              <span className="text-xs text-emerald-400">
                {counts.completed} completed
              </span>
            )}
            {counts.failed && (
              <span className="text-xs text-red-400">{counts.failed} failed</span>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ReportSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!reports || reports.length === 0) && <EmptyState />}

      {/* Reports list */}
      {!isLoading && reports && reports.length > 0 && (
        <div className="space-y-3" data-testid="reports-list">
          {[...reports]
            .sort(
              (a, b) =>
                STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
            )
            .map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
        </div>
      )}
    </div>
  );
}
