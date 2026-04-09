import { useState, useMemo, useEffect } from "react";
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

interface TrendDataPoint {
  date?: string;
  value?: number;
  fecha?: string;
  ipv?: number;
  [key: string]: any;
}

interface MarketTrendResponse {
  source?: string;
  data?: TrendDataPoint[];
  points?: number;
  start_period?: string | null;
  end_period?: string | null;
  capital_appreciation_pct?: number | null;
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
      <div className="rounded-lg glass-panel px-3 py-2">
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

  const { data: rawResponse, isLoading, isError } = useQuery<MarketTrendResponse>({
    queryKey: ["/api/market-trend"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const allData = useMemo(
    () => normalizeTrendData(Array.isArray(rawResponse?.data) ? rawResponse.data : []),
    [rawResponse]
  );

  const filteredData = useMemo(() => {
    if (yearFilter === "All") return allData;
    return allData.filter((d) => d.date.startsWith(yearFilter));
  }, [allData, yearFilter]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        allData
          .map((d) => d.date.split("-")[0])
          .filter((y) => /^\d{4}$/.test(y))
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["All", ...years];
  }, [allData]);

  useEffect(() => {
    if (!yearOptions.includes(yearFilter)) {
      setYearFilter("All");
    }
  }, [yearFilter, yearOptions]);

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
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y} data-testid={`year-option-${y}`}>
                {y === "All" ? "All years" : y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fallback notice */}
      {(isError || allData.length === 0) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Live market data is currently unavailable from INE source.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats row */}
      {!isLoading && allData.length > 0 && (
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
          ) : filteredData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
              No live IPV points available for this filter.
            </div>
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
