import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Mock data fallback
const MOCK_DATA = [
  { date: "2020-01", value: 140.2 },
  { date: "2020-04", value: 141.5 },
  { date: "2020-07", value: 138.9 },
  { date: "2020-10", value: 140.1 },
  { date: "2021-01", value: 143.0 },
  { date: "2021-04", value: 146.2 },
  { date: "2021-07", value: 149.7 },
  { date: "2021-10", value: 152.3 },
  { date: "2022-01", value: 155.8 },
  { date: "2022-04", value: 159.4 },
  { date: "2022-07", value: 163.1 },
  { date: "2022-10", value: 165.9 },
  { date: "2023-01", value: 167.2 },
  { date: "2023-04", value: 169.8 },
  { date: "2023-07", value: 172.4 },
  { date: "2023-10", value: 174.9 },
  { date: "2024-01", value: 177.3 },
  { date: "2024-04", value: 180.1 },
  { date: "2024-07", value: 183.6 },
  { date: "2024-10", value: 186.2 },
  { date: "2025-01", value: 188.9 },
  { date: "2025-04", value: 191.5 },
  { date: "2025-07", value: 194.0 },
  { date: "2025-10", value: 196.8 },
  { date: "2026-01", value: 199.2 },
];

const YEAR_OPTIONS = ["All", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

interface TrendDataPoint {
  date?: string;
  value?: number;
  fecha?: string;
  ipv?: number;
  [key: string]: any;
}

function normalizeTrendData(raw: TrendDataPoint[]): { date: string; value: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((item) => ({
      date: item.date ?? item.fecha ?? "",
      value: Number(item.value ?? item.ipv ?? 0),
    }))
    .filter((d) => d.date && !isNaN(d.value));
}

function formatDate(dateStr: string): string {
  try {
    const [year, month] = dateStr.split("-");
    if (!year || !month) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(month) - 1]} ${year}`;
  } catch {
    return dateStr;
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
        <p className="text-xs text-muted-foreground mb-1">{formatDate(label)}</p>
        <p className="text-sm font-bold text-foreground">
          IPV: <span className="text-primary">{payload[0].value?.toFixed(1)}</span>
        </p>
      </div>
    );
  }
  return null;
}

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3 w-1/4" />
      <Skeleton className="h-80 w-full mt-4" />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function MarketTrends() {
  const [yearFilter, setYearFilter] = useState("All");

  const { data: rawData, isLoading, isError } = useQuery<TrendDataPoint[]>({
    queryKey: ["/api/market-trend"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const allData = useMemo(() => {
    if (isError || !rawData) return MOCK_DATA;
    const normalized = normalizeTrendData(rawData);
    return normalized.length > 0 ? normalized : MOCK_DATA;
  }, [rawData, isError]);

  const filteredData = useMemo(() => {
    if (yearFilter === "All") return allData;
    return allData.filter((d) => d.date.startsWith(yearFilter));
  }, [allData, yearFilter]);

  // Stats
  const latestValue = filteredData[filteredData.length - 1]?.value;
  const firstValue = filteredData[0]?.value;
  const changeAbs = latestValue !== undefined && firstValue !== undefined
    ? (latestValue - firstValue).toFixed(1)
    : "—";
  const changePct = latestValue !== undefined && firstValue !== undefined && firstValue !== 0
    ? (((latestValue - firstValue) / firstValue) * 100).toFixed(1)
    : "—";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Market Trends
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Housing Price Index (IPV) — Spain
          </p>
        </div>
        <Select
          value={yearFilter}
          onValueChange={setYearFilter}
          data-testid="year-filter"
        >
          <SelectTrigger className="w-36" data-testid="year-filter-trigger">
            <SelectValue placeholder="Filter by year" />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={y} data-testid={`year-option-${y}`}>
                {y === "All" ? "All years" : y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fallback notice */}
      {(isError || (rawData && normalizeTrendData(rawData).length === 0)) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Live market data is currently unavailable. Showing illustrative mock data.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats row */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Latest IPV"
            value={latestValue !== undefined ? latestValue.toFixed(1) : "—"}
            sub="Most recent reading"
          />
          <StatCard
            label="Change (pts)"
            value={changePct !== "—" ? `+${changeAbs}` : "—"}
            sub={yearFilter === "All" ? "Full period" : `In ${yearFilter}`}
          />
          <StatCard
            label="% Change"
            value={changePct !== "—" ? `+${changePct}%` : "—"}
            sub={yearFilter === "All" ? "Full period" : `In ${yearFilter}`}
          />
          <StatCard
            label="Data Points"
            value={String(filteredData.length)}
            sub={yearFilter === "All" ? "All periods" : yearFilter}
          />
        </div>
      )}

      {/* Chart */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-5 px-6">
          <CardTitle className="text-sm font-semibold">
            Housing Price Index (IPV) — Spain
          </CardTitle>
          <CardDescription className="text-xs">
            {yearFilter === "All"
              ? "Full historical data"
              : `Filtered to year ${yearFilter}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {isLoading ? (
            <ChartSkeleton />
          ) : (
            <div className="h-80" data-testid="ipv-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={filteredData}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ipvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38 65% 55%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(38 65% 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => v.toFixed(0)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(38 65% 55%)"
                    strokeWidth={2.5}
                    fill="url(#ipvGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: "hsl(38 65% 55%)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend / info */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[hsl(38_65%_55%)]" />
          <span>IPV (Base 100 = Q1 2015)</span>
        </div>
        <Badge variant="outline" className="text-xs">
          Ministerio de Vivienda — Spain
        </Badge>
      </div>
    </div>
  );
}
