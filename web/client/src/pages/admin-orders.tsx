import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Report } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

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
  const ADMIN_NOTA_TYPE = "expert_report";
  const qc = useQueryClient();
  const { toast } = useToast();
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
      ].join(" ").toLowerCase();
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
      toast({ title: "Status updated" });
    },
    onError: (err: any) => {
      toast({ title: "Status update failed", description: err?.message || "Unknown error", variant: "destructive" });
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
      toast({ title: "PDF link saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
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
      toast({
        title: vars.complete ? "Nota JSON saved — order completed" : "Nota JSON saved (draft)",
      });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
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
      toast({ title: "PDF uploaded and OCR processed" });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err?.message || "Unknown error", variant: "destructive" });
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
      toast({ title: "Audit load failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoadingAuditFor(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin — Nota Simple (manual)</h1>
          <p className="text-sm text-muted-foreground">
            Cerere către colaborator / registru: marchezi pașii aici; când primești PDF-ul, încarci pentru OCR sau lipești JSON.
            Status <code className="text-xs">waiting_partner</code> înseamnă „aștept documentul Nota”, nu un API automat.
          </p>
        </div>
        <Button variant="outline" onClick={refresh}>Refresh</Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Orders ({filteredRows.length} / {rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_CHIPS.map((chip) => {
              const count = chip === "all" ? rows.length : (counts[chip] ?? 0);
              const isActive = statusFilter === chip;
              const label = chip === "all" ? "all" : (STATUS_LABEL[chip] ?? chip);
              return (
                <Button
                  key={chip}
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setStatusFilter(chip)}
                >
                  {label} ({count})
                </Button>
              );
            })}
            <Button
              size="sm"
              variant={actionableOnly ? "default" : "outline"}
              onClick={() => setActionableOnly((v) => !v)}
            >
              Actionable only
            </Button>
          </div>

          <div className="max-w-md">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, address, catastral ref, Stripe PI..."
            />
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No expert_report orders found.</p>
          )}
          {!isLoading && filteredRows.map((report) => (
            <div key={report.id} className="rounded-lg glass-panel p-3 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">Order #{report.id}</p>
                  <p className="text-xs text-muted-foreground">{shortDate(report.createdAt)}</p>
                </div>
                <Badge variant="outline">{STATUS_LABEL[report.status] ?? report.status}</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Address:</span> {report.address || "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Ref catastral:</span> {report.referenciaCatastral || "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span> {report.type}
                </div>
                <div>
                  <span className="text-muted-foreground">Stripe PI:</span> {report.stripeSessionId || "-"}
                </div>
                {(report as any).providerOrderId ? (
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Legacy provider ref: {(report as any).providerName || "-"} / {(report as any).providerOrderId}
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">1. Cerere manuală Nota Simple</p>
                <p className="text-xs text-muted-foreground">
                  După ce trimiți cererea către colaborator sau registru, marchează starea și lasă o notă în audit (ex. canal, referință).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
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
                    size="sm"
                    variant="outline"
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
                </div>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">2. Livrare către client (Informes)</p>
                <div className="space-y-2">
                  <Label htmlFor={`pdf-url-${report.id}`}>Link PDF Nota (opțional)</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      id={`pdf-url-${report.id}`}
                      className="max-w-xl flex-1 min-w-[200px]"
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
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const u = (
                          pdfUrlByReport[report.id] !== undefined
                            ? pdfUrlByReport[report.id]
                            : (report.pdfUrl ?? "")
                        ).trim();
                        if (!u) {
                          toast({ title: "Introdu un URL", variant: "destructive" });
                          return;
                        }
                        savePdfUrl.mutate({ id: report.id, pdfUrl: u });
                      }}
                      disabled={savePdfUrl.isPending}
                    >
                      Salvează link
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1 min-w-[220px]">
                    <Label htmlFor={`pdf-${report.id}`}>Încarcă PDF Nota Simple</Label>
                    <Input
                      id={`pdf-${report.id}`}
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setSelectedFiles((prev) => ({ ...prev, [report.id]: file }));
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      const file = selectedFiles[report.id];
                      if (!file) {
                        toast({ title: "Selectează un PDF", variant: "destructive" });
                        return;
                      }
                      uploadPdf.mutate({ id: report.id, file });
                    }}
                    disabled={uploadPdf.isPending}
                  >
                    Upload + OCR
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`nota-json-${report.id}`}>Lipește JSON Nota (fără OCR)</Label>
                  <Textarea
                    id={`nota-json-${report.id}`}
                    className="font-mono text-xs min-h-[100px]"
                    placeholder='{"structured": {...}}'
                    value={notaJsonByReport[report.id] ?? ""}
                    onChange={(e) =>
                      setNotaJsonByReport((prev) => ({ ...prev, [report.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`complete-json-${report.id}`}
                        checked={completePastedJson[report.id] !== false}
                        onCheckedChange={(c) =>
                          setCompletePastedJson((prev) => ({
                            ...prev,
                            [report.id]: c === true,
                          }))
                        }
                      />
                      <Label htmlFor={`complete-json-${report.id}`} className="text-xs font-normal cursor-pointer">
                        Finalizează comanda și notifică clientul (email)
                      </Label>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const raw = (notaJsonByReport[report.id] ?? "").trim();
                        if (!raw) {
                          toast({ title: "Lipește JSON valid", variant: "destructive" });
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
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 flex-wrap border-t border-border/40 pt-3">
                <div className="space-y-1">
                  <Label htmlFor={`status-${report.id}`}>Set status</Label>
                  <select
                    id={`status-${report.id}`}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={report.status}
                    onChange={(e) => patchStatus.mutate({
                      id: report.id,
                      status: e.target.value,
                      note: notes[report.id]?.trim() || undefined,
                    })}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 min-w-[260px]">
                  <Label htmlFor={`note-${report.id}`}>Notă internă (audit)</Label>
                  <Input
                    id={`note-${report.id}`}
                    value={notes[report.id] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNotes((prev) => ({ ...prev, [report.id]: value }));
                    }}
                    placeholder="ex: trimis pe email la colaborator X"
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => loadAuditTrail(report.id)}
                  disabled={loadingAuditFor === report.id}
                >
                  {loadingAuditFor === report.id ? "Loading..." : "Load audit"}
                </Button>
              </div>

              {auditByReport[report.id]?.length ? (
                <div className="rounded-md glass-panel p-2 space-y-1">
                  <p className="text-xs font-medium text-foreground">Audit trail</p>
                  {auditByReport[report.id].map((ev) => (
                    <div key={ev.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{shortDate(ev.createdAt)}</span>
                      {" — "}
                      {(ev.fromStatus || "none")} → {ev.toStatus}
                      {" by "}
                      <span className="text-foreground">{ev.actorName || ev.actorEmail || "system"}</span>
                      {ev.note ? ` (${ev.note})` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
