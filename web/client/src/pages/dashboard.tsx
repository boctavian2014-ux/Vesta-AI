import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Building2, TrendingUp, BarChart3, FileText, Map, ArrowRight } from "lucide-react";

// Mock trend data for mini-chart
const TREND_DATA = [
  { month: "Oct", ipv: 168 },
  { month: "Nov", ipv: 171 },
  { month: "Dec", ipv: 174 },
  { month: "Jan", ipv: 177 },
  { month: "Feb", ipv: 180 },
  { month: "Mar", ipv: 184 },
  { month: "Apr", ipv: 187 },
];

const KPI_CARDS = [
  {
    label: "Properties Analyzed",
    value: "47",
    icon: Building2,
    description: "Total properties reviewed",
    badge: "+3 this week",
  },
  {
    label: "Avg. Gross Yield",
    value: "6.2%",
    icon: TrendingUp,
    description: "Average across saved properties",
    badge: "Above market",
  },
  {
    label: "Market Score",
    value: "72/100",
    icon: BarChart3,
    description: "Spain housing market health",
    badge: "Stable",
  },
  {
    label: "Reports Generated",
    value: "12",
    icon: FileText,
    description: "Detailed property reports",
    badge: "2 pending",
  },
];

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">
          IPV {payload[0].value}
        </p>
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useHashLocation();

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting()}, {user?.username ?? "there"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's your real estate intelligence overview
          </p>
        </div>
        <Badge variant="secondary" className="mt-1">
          Spain Market
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <Card key={card.label} className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">
                  {card.label}
                </CardDescription>
                <div className="p-1.5 rounded-md bg-primary/10">
                  <card.icon className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold text-foreground mb-1">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
              <Badge
                variant="outline"
                className="mt-2 text-xs border-primary/20 text-primary"
              >
                {card.badge}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mini Chart */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">
              Housing Price Index — Recent Trend
            </CardTitle>
            <CardDescription className="text-xs">
              IPV (Índice de Precio de Vivienda) last 7 months
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-44" data-testid="trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TREND_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38 65% 55%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(38 65% 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ipv"
                    stroke="hsl(38 65% 55%)"
                    strokeWidth={2}
                    fill="url(#dashGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "hsl(38 65% 55%)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
            <CardDescription className="text-xs">
              Jump to key features
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Button
              className="w-full justify-between"
              onClick={() => navigate("/map")}
              data-testid="quick-action-map"
            >
              <span className="flex items-center gap-2">
                <Map className="h-4 w-4" />
                Analyze Property
              </span>
              <ArrowRight className="h-4 w-4 opacity-60" />
            </Button>

            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={() => navigate("/trends")}
              data-testid="quick-action-trends"
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                View Trends
              </span>
              <ArrowRight className="h-4 w-4 opacity-60" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/properties")}
              data-testid="quick-action-properties"
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Saved Properties
              </span>
              <ArrowRight className="h-4 w-4 opacity-60" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/reports")}
              data-testid="quick-action-reports"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Reports
              </span>
              <ArrowRight className="h-4 w-4 opacity-60" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
