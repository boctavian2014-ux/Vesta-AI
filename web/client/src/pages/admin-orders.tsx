import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Report } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { showVestaMessage } from "@/lib/vesta-message";
import { InboxOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";

const { Title, Text, Paragraph } = Typography;

type ReportStatusEvent = {
  id: number;
  reportId: number;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = [
  "paid",
  "submitted_manual",
  "waiting_partner",
  "pdf_received",
  "completed",
  "failed_refundable",
  "refunded",
];

const STATUS_LABEL: Record<string, string> = {
  paid: "paid",
  submitted_manual: "submitted (manual)",
  waiting_partner: "waiting Nota PDF",
  pdf_received: "pdf_received",
  completed: "completed",
  failed_refundable: "failed_refundable",
  refunded: "refunded",
};

const FILTER_CHIPS = ["all", ...STATUS_OPTIONS];

function shortDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function manualNoteLine(action: string): string {
  return `${action} — ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default function AdminOrders() {
  const { message } = App.useApp();
  const ADMIN_NOTA_TYPE = "expert_report";
  const qc = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [pdfUrlByReport, setPdfUrlByReport] = useState<Record<number, string>>({});
  const [notaJsonByReport, setNotaJsonByReport] = useState<Record<number, string>>({});
  const [completePastedJson, setCompletePastedJson] = useState<Record<number, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [actionableOnly, setActionableOnly] = useState(true);
  const [auditByReport, setAuditByReport] = useState<Record<number, ReportStatusEvent[]>>({});
  const [loadingAuditFor, setLoadingAuditFor] = useState<number | null>(null);

  const { data, isLoading } = useQuery<Report[]>({
    queryKey: [`/api/admin/nota-orders?type=${ADMIN_NOTA_TYPE}`],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 10_000,
  });

  const rows = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return byStatus;
  }, [rows]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (actionableOnly && ["completed", "refunded"].includes(r.status)) return false;
      if (!q) return true;
      const hay = [
        String(r.id),
        r.address || "",
        r.referenciaCatastral || "",
        r.stripeSessionId || "",
        (r as any).providerOrderId || "",
        (r as any).providerStatus || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, actionableOnly]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: [`/api/admin/nota-orders?type=${ADMIN_NOTA_TYPE}`] });
  };

  const patchStatus = useMutation({
    mutationFn: async ({ id, status, note }: { id: number; status: string; note?: string }) => {
      const res = await fetch(`/api/admin/reports/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
      setAuditByReport({});
      showVestaMessage(message, { title: "Status updated", variant: "success" });
    },
    onError: (err: any) => {
      message.error(err?.message || "Status update failed");
    },
  });

  const savePdfUrl = useMutation({
    mutationFn: async ({ id, pdfUrl }: { id: number; pdfUrl: string }) => {
      const res = await fetch(`/api/admin/reports/${id}/pdf-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfUrl }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to save PDF URL");
      }
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
      setAuditByReport({});
      showVestaMessage(message, { title: "PDF link saved", variant: "success" });
    },
    onError: (err: any) => {
      message.error(err?.message || "Save failed");
    },
  });

  const saveNotaJson = useMutation({
    mutationFn: async ({
      id,
      raw,
      complete,
    }: {
      id: number;
      raw: string;
      complete: boolean;
    }) => {
      const res = await fetch(`/api/admin/reports/${id}/nota-simple-json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaSimpleJson: raw, complete }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to save JSON");
      }
      return res.json();
    },
    onSuccess: async (_, vars) => {
      await refresh();
      setAuditByReport({});
      showVestaMessage(message, {
        title: vars.complete ? "Nota JSON saved — order completed" : "Nota JSON saved (draft)",
        variant: vars.complete ? "success" : "warning",
      });
    },
    onError: (err: any) => {
      message.error(err?.message || "Save failed");
    },
  });

  const uploadPdf = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/reports/${id}/upload-nota-simple`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Upload failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
      setAuditByReport({});
      showVestaMessage(message, {
        title: "PDF uploaded and OCR processed",
        variant: "success",
      });
    },
    onError: (err: any) => {
      message.error(err?.message || "Upload failed");
    },
  });

  const loadAuditTrail = async (reportId: number) => {
    try {
      setLoadingAuditFor(reportId);
      const res = await fetch(`/api/admin/reports/${reportId}/audit-trail`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const auditRows = (await res.json()) as ReportStatusEvent[];
      setAuditByReport((prev) => ({ ...prev, [reportId]: auditRows }));
    } catch (err: any) {
      message.error(err?.message || "Audit load failed");
    } finally {
      setLoadingAuditFor(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1024, margin: "0 auto" }}>
      <Row justify="space-between" align="top" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="1 1 280px">
          <Title level={3} style={{ marginBottom: 8 }}>
            Admin — Nota Simple (manual)
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Cerere către colaborator / registru: marchezi pașii aici; când primești PDF-ul, încarci pentru OCR sau
            lipești JSON. Status <Text code>waiting_partner</Text> înseamnă „aștept documentul Nota”, nu un API automat.
          </Paragraph>
        </Col>
        <Col>
          <Button onClick={refresh}>Refresh</Button>
        </Col>
      </Row>

      <Card title={`Orders (${filteredRows.length} / ${rows.length})`} variant="borderless" className="border border-border bg-card shadow-sm">
        <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
          {FILTER_CHIPS.map((chip) => {
            const count = chip === "all" ? rows.length : (counts[chip] ?? 0);
            const isActive = statusFilter === chip;
            const label = chip === "all" ? "all" : (STATUS_LABEL[chip] ?? chip);
            return (
              <Button
                key={chip}
                size="small"
                type={isActive ? "primary" : "default"}
                onClick={() => setStatusFilter(chip)}
              >
                {label} ({count})
              </Button>
            );
          })}
          <Button
            size="small"
            type={actionableOnly ? "primary" : "default"}
            onClick={() => setActionableOnly((v) => !v)}
          >
            Actionable only
          </Button>
        </Space>

        <Input
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, address, catastral ref, Stripe PI..."
          style={{ maxWidth: 400, marginBottom: 16 }}
        />

        {isLoading && <Text type="secondary">Loading...</Text>}
        {!isLoading && filteredRows.length === 0 && (
          <Empty
            image={<InboxOutlined style={{ fontSize: 40, color: "hsl(var(--muted-foreground))" }} />}
            styles={{ image: { height: 48 } }}
            description={
              <span>
                <Text type="secondary" strong style={{ display: "block", marginBottom: 4 }}>
                  No orders match this filter
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Try &quot;all&quot; or clear search — only <Text code>expert_report</Text> rows are listed here.
                </Text>
              </span>
            }
          />
        )}
        {!isLoading &&
          filteredRows.map((report) => (
            <Card key={report.id} size="small" style={{ marginBottom: 16 }} className="border border-border bg-card shadow-sm">
              <Row justify="space-between" align="middle" wrap gutter={[8, 8]}>
                <Col>
                  <Text strong>Order #{report.id}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {shortDate(report.createdAt)}
                    </Text>
                  </div>
                </Col>
                <Col>
                  <Tag color="blue">{STATUS_LABEL[report.status] ?? report.status}</Tag>
                </Col>
              </Row>

              <Divider style={{ margin: "12px 0" }} />

              <Row gutter={[8, 8]}>
                <Col xs={24} md={12}>
                  <Text type="secondary">Address: </Text>
                  <Text>{report.address || "-"}</Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Ref catastral: </Text>
                  <Text>{report.referenciaCatastral || "-"}</Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Type: </Text>
                  <Text>{report.type}</Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Stripe PI: </Text>
                  <Text>{report.stripeSessionId || "-"}</Text>
                </Col>
                {(report as any).providerOrderId ? (
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Legacy provider ref: {(report as any).providerName || "-"} / {(report as any).providerOrderId}
                    </Text>
                  </Col>
                ) : null}
              </Row>

              <Card size="small" type="inner" title="1. Cerere manuală Nota Simple" style={{ marginTop: 16 }}>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  După ce trimiți cererea către colaborator sau registru, marchează starea și lasă o notă în audit (ex.
                  canal, referință).
                </Paragraph>
                <Space wrap>
                  <Button
                    size="small"
                    onClick={() => {
                      const line = manualNoteLine("Nota Simple request sent to collaborator");
                      setNotes((prev) => ({ ...prev, [report.id]: line }));
                      patchStatus.mutate({
                        id: report.id,
                        status: "submitted_manual",
                        note: line,
                      });
                    }}
                    disabled={patchStatus.isPending}
                  >
                    Marchează: cerere trimisă
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      const line = manualNoteLine("Waiting for Nota Simple PDF from collaborator");
                      setNotes((prev) => ({ ...prev, [report.id]: line }));
                      patchStatus.mutate({
                        id: report.id,
                        status: "waiting_partner",
                        note: line,
                      });
                    }}
                    disabled={patchStatus.isPending}
                  >
                    Marchează: aștept PDF Nota
                  </Button>
                </Space>
              </Card>

              <Card size="small" type="inner" title="2. Livrare către client (Informes)" style={{ marginTop: 12 }}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div>
                    <Text type="secondary">Link PDF Nota (opțional)</Text>
                    <Space.Compact style={{ width: "100%", maxWidth: 560, marginTop: 6 }}>
                      <Input
                        placeholder="https://..."
                        value={
                          pdfUrlByReport[report.id] !== undefined
                            ? pdfUrlByReport[report.id]
                            : (report.pdfUrl ?? "")
                        }
                        onChange={(e) =>
                          setPdfUrlByReport((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                      />
                      <Button
                        onClick={() => {
                          const u = (
                            pdfUrlByReport[report.id] !== undefined
                              ? pdfUrlByReport[report.id]
                              : (report.pdfUrl ?? "")
                          ).trim();
                          if (!u) {
                            message.error("Introdu un URL");
                            return;
                          }
                          savePdfUrl.mutate({ id: report.id, pdfUrl: u });
                        }}
                        disabled={savePdfUrl.isPending}
                      >
                        Salvează link
                      </Button>
                    </Space.Compact>
                  </div>
                  <Space align="end" wrap>
                    <div>
                      <Text type="secondary">Încarcă PDF Nota Simple</Text>
                      <div style={{ marginTop: 6 }}>
                        <input
                          id={`pdf-${report.id}`}
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setSelectedFiles((prev) => ({ ...prev, [report.id]: file }));
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        const file = selectedFiles[report.id];
                        if (!file) {
                          message.error("Selectează un PDF");
                          return;
                        }
                        uploadPdf.mutate({ id: report.id, file });
                      }}
                      disabled={uploadPdf.isPending}
                    >
                      Upload + OCR
                    </Button>
                  </Space>
                  <div>
                    <Text type="secondary">Lipește JSON Nota (fără OCR)</Text>
                    <Input.TextArea
                      id={`nota-json-${report.id}`}
                      style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12 }}
                      rows={4}
                      placeholder='{"structured": {...}}'
                      value={notaJsonByReport[report.id] ?? ""}
                      onChange={(e) =>
                        setNotaJsonByReport((prev) => ({ ...prev, [report.id]: e.target.value }))
                      }
                    />
                    <Space style={{ marginTop: 8 }} wrap>
                      <Checkbox
                        checked={completePastedJson[report.id] !== false}
                        onChange={(e) =>
                          setCompletePastedJson((prev) => ({
                            ...prev,
                            [report.id]: e.target.checked,
                          }))
                        }
                      >
                        Finalizează comanda și notifică clientul (email)
                      </Checkbox>
                      <Button
                        size="small"
                        onClick={() => {
                          const raw = (notaJsonByReport[report.id] ?? "").trim();
                          if (!raw) {
                            message.error("Lipește JSON valid");
                            return;
                          }
                          saveNotaJson.mutate({
                            id: report.id,
                            raw,
                            complete: completePastedJson[report.id] !== false,
                          });
                        }}
                        disabled={saveNotaJson.isPending}
                      >
                        Salvează JSON
                      </Button>
                    </Space>
                  </div>
                </Space>
              </Card>

              <Divider />
              <Space wrap align="end" size="middle">
                <div>
                  <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                    Set status
                  </Text>
                  <Select
                    id={`status-${report.id}`}
                    defaultValue={report.status}
                    style={{ minWidth: 200 }}
                    options={STATUS_OPTIONS.map((s) => ({
                      value: s,
                      label: STATUS_LABEL[s] ?? s,
                    }))}
                    onChange={(value) =>
                      patchStatus.mutate({
                        id: report.id,
                        status: value,
                        note: notes[report.id]?.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                    Notă internă (audit)
                  </Text>
                  <Input
                    id={`note-${report.id}`}
                    value={notes[report.id] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNotes((prev) => ({ ...prev, [report.id]: value }));
                    }}
                    placeholder="ex: trimis pe email la colaborator X"
                    style={{ minWidth: 260 }}
                  />
                </div>
                <Button onClick={() => loadAuditTrail(report.id)} disabled={loadingAuditFor === report.id}>
                  {loadingAuditFor === report.id ? "Loading..." : "Load audit"}
                </Button>
              </Space>

              {auditByReport[report.id]?.length ? (
                <Card size="small" className="border border-border bg-card shadow-sm" style={{ marginTop: 12 }}>
                  <Text strong style={{ fontSize: 12 }}>
                    Audit trail
                  </Text>
                  {auditByReport[report.id].map((ev) => (
                    <div key={ev.id} style={{ fontSize: 12, marginTop: 6 }}>
                      <Text>{shortDate(ev.createdAt)}</Text>
                      <Text type="secondary">
                        {" — "}
                        {(ev.fromStatus || "none")} → {ev.toStatus}
                        {" by "}
                      </Text>
                      <Text>{ev.actorName || ev.actorEmail || "system"}</Text>
                      {ev.note ? <Text type="secondary"> ({ev.note})</Text> : null}
                    </div>
                  ))}
                </Card>
              ) : null}
            </Card>
          ))}
      </Card>
    </div>
  );
}
