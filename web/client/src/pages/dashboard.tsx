import type { ReactNode } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/hooks/use-auth";
import { useUiLocale } from "@/lib/ui-locale";
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
import { TrendingUp, BarChart3, FileText, Map, ArrowRight } from "lucide-react";
import { VestaBrandLogoMark } from "@/components/vesta-brand-logo";

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

type KpiCardDef = {
  label: string;
  value: string;
  description: string;
  badge: string;
  icon: ReactNode;
};

const KPI_CARDS: KpiCardDef[] = [
  {
    label: "Properties Analyzed",
    value: "47",
    icon: <VestaBrandLogoMark imgClassName="h-3.5 w-auto max-h-3.5" />,
    description: "Total properties reviewed",
    badge: "+3 this week",
  },
  {
    label: "Avg. Gross Yield",
    value: "6.2%",
    icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
    description: "Average across saved properties",
    badge: "Above market",
  },
  {
    label: "Market Score",
    value: "72/100",
    icon: <BarChart3 className="h-3.5 w-3.5 text-primary" />,
    description: "Spain housing market health",
    badge: "Stable",
  },
  {
    label: "Reports Generated",
    value: "12",
    icon: <FileText className="h-3.5 w-3.5 text-primary" />,
    description: "Detailed property reports",
    badge: "2 pending",
  },
];

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg glass-panel px-3 py-2">
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
  const { locale } = useUiLocale();
  const [, navigate] = useHashLocation();
  const t = locale === "es"
    ? {
        goodMorning: "Buenos días",
        goodAfternoon: "Buenas tardes",
        goodEvening: "Buenas noches",
        hello: "hola",
        overview: "Aquí tienes tu resumen de inteligencia inmobiliaria",
        marketBadge: "Mercado España",
        chartTitle: "Índice de Precio de Vivienda — Tendencia reciente",
        chartDesc: "IPV últimos 7 meses",
        quickActions: "Acciones rápidas",
        quickActionsDesc: "Ir a funciones clave",
        analyzeProperty: "Analizar propiedad",
        viewTrends: "Ver tendencias",
        savedProperties: "Propiedades guardadas",
        reports: "Informes",
      }
    : {
        goodMorning: "Good morning",
        goodAfternoon: "Good afternoon",
        goodEvening: "Good evening",
        hello: "there",
        overview: "Here's your real estate intelligence overview",
        marketBadge: "Spain Market",
        chartTitle: "Housing Price Index — Recent Trend",
        chartDesc: "IPV last 7 months",
        quickActions: "Quick Actions",
        quickActionsDesc: "Jump to key features",
        analyzeProperty: "Analyze Property",
        viewTrends: "View Trends",
        savedProperties: "Saved Properties",
        reports: "Reports",
      };

  const kpiCards: KpiCardDef[] = locale === "es"
    ? [
        {
          label: "Propiedades analizadas",
          value: "47",
          icon: <VestaBrandLogoMark imgClassName="h-3.5 w-auto max-h-3.5" />,
          description: "Total de propiedades revisadas",
          badge: "+3 esta semana",
        },
        {
          label: "Rentabilidad bruta media",
          value: "6.2%",
          icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
          description: "Promedio en propiedades guardadas",
          badge: "Por encima del mercado",
        },
        {
          label: "Puntuación de mercado",
          value: "72/100",
          icon: <BarChart3 className="h-3.5 w-3.5 text-primary" />,
          description: "Salud del mercado inmobiliario español",
          badge: "Estable",
        },
        {
          label: "Informes generados",
          value: "12",
          icon: <FileText className="h-3.5 w-3.5 text-primary" />,
          description: "Informes detallados de propiedades",
          badge: "2 pendientes",
        },
      ]
    : KPI_CARDS;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.goodMorning;
    if (hour < 18) return t.goodAfternoon;
    return t.goodEvening;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting()}, {user?.username ?? t.hello}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.overview}
          </p>
        </div>
        <Badge variant="secondary" className="mt-1">
          {t.marketBadge}
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.label} className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">
                  {card.label}
                </CardDescription>
                <div className="p-1.5 rounded-md bg-primary/10 flex items-center justify-center min-w-[1.75rem] min-h-[1.75rem]">
                  {card.icon}
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
            <CardTitle className="text-sm font-semibold">{t.chartTitle}</CardTitle>
            <CardDescription className="text-xs">
              {t.chartDesc}
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
            <CardTitle className="text-sm font-semibold">{t.quickActions}</CardTitle>
            <CardDescription className="text-xs">
              {t.quickActionsDesc}
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
                {t.analyzeProperty}
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
                {t.viewTrends}
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
                <VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />
                {t.savedProperties}
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
                {t.reports}
              </span>
              <ArrowRight className="h-4 w-4 opacity-60" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
