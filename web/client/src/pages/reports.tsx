import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { Button, Card, Empty, Skeleton, Space, Tag, Typography } from "antd";
import {
  FileTextOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  EnvironmentOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import type { Report } from "@shared/schema";
import { getReportsStrings, isReportDemoPreview } from "@/lib/reports-i18n";
import type { AppLocale } from "@/lib/locale";
import { useUiLocale } from "@/lib/ui-locale";

const { Title, Text } = Typography;

function StatusTag({
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
      color: string;
      icon: ReactNode;
    }
  > = {
    pending: {
      label: s.statusPending,
      color: "gold",
      icon: <ClockCircleOutlined />,
    },
    processing: {
      label: s.statusProcessing,
      color: "blue",
      icon: <LoadingOutlined />,
    },
    paid: {
      label: s.statusPaid,
      color: "purple",
      icon: <ClockCircleOutlined />,
    },
    submitted_manual: {
      label: s.statusSubmittedManual,
      color: "cyan",
      icon: <ClockCircleOutlined />,
    },
    waiting_partner: {
      label: s.statusWaitingPartner,
      color: "geekblue",
      icon: <ClockCircleOutlined />,
    },
    pdf_received: {
      label: s.statusPdfReceived,
      color: "cyan",
      icon: <FileTextOutlined />,
    },
    completed: {
      label: s.statusCompleted,
      color: "success",
      icon: <CheckCircleOutlined />,
    },
    failed: {
      label: s.statusFailed,
      color: "error",
      icon: <CloseCircleOutlined />,
    },
    failed_refundable: {
      label: s.statusFailedRefundable,
      color: "magenta",
      icon: <CloseCircleOutlined />,
    },
  };

  const config = configs[status] ?? {
    label: status,
    color: "default",
    icon: null,
  };

  return (
    <Tag icon={config.icon} color={config.color}>
      {config.label}
    </Tag>
  );
}

function ReportTypeTag({
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
  return <Tag>{labels[type] ?? s.typeGenericPropertyReport}</Tag>;
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
    <Card size="small">
      <Space align="start" style={{ width: "100%" }}>
        <Skeleton.Avatar active size="large" shape="square" />
        <div style={{ flex: 1 }}>
          <Skeleton active paragraph={{ rows: 2 }} title />
        </div>
      </Space>
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
        hoverable
        size="small"
        data-testid={`report-card-${report.id}`}
        styles={{ body: { padding: 16 } }}
      >
        <Space align="start" style={{ width: "100%" }} size="middle">
          <div
            style={{
              padding: 10,
              borderRadius: 4,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--muted) / 0.35)",
            }}
          >
            <FileTextOutlined style={{ fontSize: 16, color: "hsl(var(--muted-foreground))" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space wrap size={[6, 6]}>
              <ReportTypeTag type={report.type} s={s} />
              {isReportDemoPreview(report) ? <Tag color="default">{s.reportDemoBadge}</Tag> : null}
              <StatusTag status={report.status} s={s} />
            </Space>
            {(report as any).address && (
              <Text strong style={{ display: "block", marginTop: 8, fontSize: 12 }} ellipsis>
                {(report as any).address}
              </Text>
            )}
            {(report as any).referenciaCatastral && (
              <Text type="secondary" style={{ fontSize: 12, fontFamily: "monospace", display: "block" }} ellipsis>
                {(report as any).referenciaCatastral}
              </Text>
            )}
            <Space size={4} style={{ marginTop: 6 }}>
              <CalendarOutlined style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatDate(report.createdAt, locale)}
              </Text>
            </Space>
          </div>
          <ArrowRightOutlined style={{ color: "hsl(var(--muted-foreground))", marginTop: 4 }} />
        </Space>
      </Card>
    </Link>
  );
}

function EmptyState({ s }: { s: ReturnType<typeof getReportsStrings> }) {
  const [, navigate] = useLocation();
  return (
    <Empty
      image={<FileTextOutlined style={{ fontSize: 48, color: "hsl(var(--muted-foreground))" }} />}
      description={
        <div style={{ textAlign: "center" }}>
          <Title level={5} style={{ marginBottom: 4 }}>
            {s.emptyTitle}
          </Title>
          <Text type="secondary">{s.emptyDescription}</Text>
        </div>
      }
    >
      <Button type="primary" onClick={() => navigate("/map")} data-testid="go-to-map-reports" icon={<EnvironmentOutlined />}>
        {s.analyzeProperty}
        <ArrowRightOutlined />
      </Button>
    </Empty>
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
  const { locale } = useUiLocale();
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
    {} as Record<string, number>,
  );

  const countSubtitle =
    !isLoading && reports
      ? `${reports.length} ${reports.length !== 1 ? s.reportsCount : s.reportsCountOne}`
      : s.reportsSubtitleLoading;

  return (
    <div style={{ padding: 24, maxWidth: 768, margin: "0 auto" }} className="font-report">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Title level={2} className="report-heading" style={{ marginBottom: 4 }}>
              {s.reportsTitle}
            </Title>
            <Text type="secondary" className="report-secondary report-aux-mobile">
              {countSubtitle}
            </Text>
          </div>
          {counts && (
            <Space wrap size={[8, 4]} style={{ fontSize: 12 }}>
              {counts.processing ? (
                <Text type="secondary">
                  {counts.processing} {s.countProcessing}
                </Text>
              ) : null}
              {counts.pending ? (
                <Text type="secondary">
                  {counts.pending} {s.countPending}
                </Text>
              ) : null}
              {counts.paid ? (
                <Text type="secondary">
                  {counts.paid} {s.countPaid}
                </Text>
              ) : null}
              {counts.submitted_manual ? (
                <Text type="secondary">
                  {counts.submitted_manual} {s.countSubmittedManual}
                </Text>
              ) : null}
              {counts.waiting_partner ? (
                <Text type="secondary">
                  {counts.waiting_partner} {s.countWaitingPartner}
                </Text>
              ) : null}
              {counts.pdf_received ? (
                <Text type="secondary">
                  {counts.pdf_received} {s.countPdfReceived}
                </Text>
              ) : null}
              {counts.completed ? (
                <Text type="secondary">
                  {counts.completed} {s.countCompleted}
                </Text>
              ) : null}
              {counts.failed_refundable ? (
                <Text type="danger">
                  {counts.failed_refundable} {s.countFailedRefundable}
                </Text>
              ) : null}
              {counts.failed ? (
                <Text type="danger">
                  {counts.failed} {s.countFailed}
                </Text>
              ) : null}
            </Space>
          )}
        </div>

        {isLoading && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {[1, 2, 3].map((i) => (
              <ReportSkeleton key={i} />
            ))}
          </Space>
        )}

        {!isLoading && (!reports || reports.length === 0) && <EmptyState s={s} />}

        {!isLoading && reports && reports.length > 0 && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle" data-testid="reports-list">
            {[...reports]
              .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
              .map((report) => (
                <ReportCard key={report.id} report={report} s={s} locale={locale} />
              ))}
          </Space>
        )}
      </Space>
    </div>
  );
}
