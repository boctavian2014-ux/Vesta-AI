import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUiLocale } from "@/lib/ui-locale";
import { Button, Card, Col, Row, Space, Tag, Typography } from "antd";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, BarChart3, FileText, Map, ArrowRight, MessageSquare } from "lucide-react";

function QuickActionContent({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-60" />
    </span>
  );
}
import { VestaBrandLogoMark } from "@/components/vesta-brand-logo";

const { Title, Text } = Typography;

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

function CustomTooltip({ active, payload, label, ipvLabel }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg glass-panel px-3 py-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">
          {ipvLabel} {payload[0].value}
        </p>
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { locale } = useUiLocale();
  const [, navigate] = useLocation();
  const t =
    locale === "es"
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
          propertySearchAi: "Búsqueda de vivienda (IA)",
          viewTrends: "Ver tendencias",
          savedProperties: "Propiedades guardadas",
          reports: "Informes",
          chartTooltipIpv: "IPV",
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
          propertySearchAi: "Property search (AI)",
          viewTrends: "View Trends",
          savedProperties: "Saved Properties",
          reports: "Reports",
          chartTooltipIpv: "HPI",
        };

  const kpiCards: KpiCardDef[] =
    locale === "es"
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
    <div style={{ padding: 24, maxWidth: 1152, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              {greeting()}, {user?.username ?? t.hello}
            </Title>
            <Text type="secondary">{t.overview}</Text>
          </div>
          <Tag color="gold">{t.marketBadge}</Tag>
        </div>

        <Row gutter={[16, 16]}>
          {kpiCards.map((card) => (
            <Col xs={24} sm={12} lg={6} key={card.label}>
              <Card size="small" className="border-border h-full">
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>
                      {card.label}
                    </Text>
                    <div className="flex items-center justify-center rounded-md bg-primary/10 p-1.5 min-w-[1.75rem] min-h-[1.75rem]">
                      {card.icon}
                    </div>
                  </div>
                  <Title level={3} style={{ margin: "4px 0 0" }}>
                    {card.value}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {card.description}
                  </Text>
                  <Tag style={{ marginTop: 4 }}>{card.badge}</Tag>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card size="small" title={t.chartTitle} className="border-border">
              <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
                {t.chartDesc}
              </Text>
              <div className="h-44" data-testid="trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={TREND_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.38} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                    <Tooltip content={<CustomTooltip ipvLabel={t.chartTooltipIpv} />} />
                    <Area
                      type="monotone"
                      dataKey="ipv"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#dashGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title={t.quickActions} className="border-border h-full">
              <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
                {t.quickActionsDesc}
              </Text>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Button block type="primary" onClick={() => navigate("/map")} data-testid="quick-action-map">
                  <QuickActionContent icon={<Map className="h-4 w-4" />} label={t.analyzeProperty} />
                </Button>
                <Button block onClick={() => navigate("/property-search")} data-testid="quick-action-property-search">
                  <QuickActionContent icon={<MessageSquare className="h-4 w-4" />} label={t.propertySearchAi} />
                </Button>
                <Button block onClick={() => navigate("/trends")} data-testid="quick-action-trends">
                  <QuickActionContent icon={<TrendingUp className="h-4 w-4" />} label={t.viewTrends} />
                </Button>
                <Button block onClick={() => navigate("/properties")} data-testid="quick-action-properties">
                  <QuickActionContent icon={<VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />} label={t.savedProperties} />
                </Button>
                <Button block onClick={() => navigate("/reports")} data-testid="quick-action-reports">
                  <QuickActionContent icon={<FileText className="h-4 w-4" />} label={t.reports} />
                </Button>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
}
