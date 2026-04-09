import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";
import { detectBrowserLocale } from "@/lib/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TutorialPage() {
  const [, navigate] = useHashLocation();
  const locale = detectBrowserLocale();
  const es = locale === "es";

  const t = {
    title: es ? "Servicios Vesta AI" : "Vesta AI services",
    intro: es
      ? "Resumen de lo que ofrecemos: desde localización gratuita en el mapa hasta informes de pago con análisis financiero y, en el paquete experto, Nota Simple estructurada y riesgo legal."
      : "What we offer: from free map location to paid reports with financial analysis, and in the expert package, structured Nota Simple and legal risk.",
    freeTitle: es ? "Gratis — Reper en el mapa" : "Free — Map lookup",
    freeItems: es
      ? [
          "Reper de la propiedad en el mapa",
          "Dirección y puntos cardinales",
          "Referencia catastral (número de catastro)",
        ]
      : [
          "Property lookup on the map",
          "Address and cardinal orientation",
          "Cadastral reference (catastral id)",
        ],
    pack15Title: es ? "15 € — Análisis financiero" : "15 € — Financial analysis",
    pack15Items: es
      ? [
          "Datos catastrales",
          "Resumen ejecutivo",
          "Riesgo de inversión",
          "Valoración financiera IA",
          "Urbanismo",
          "Análisis del entorno (barrio)",
          "Análisis de zona (MVP)",
        ]
      : [
          "Cadastral data",
          "Executive summary",
          "Investment risk",
          "AI financial evaluation",
          "Urbanism",
          "Neighborhood analysis",
          "Zone analysis (MVP)",
        ],
    pack50Title: es ? "50 € — Informe experto completo" : "50 € — Full expert report",
    pack50Items: es
      ? [
          "Datos catastrales",
          "Datos extraídos de Nota Simple",
          "Resumen ejecutivo",
          "Riesgo de inversión",
          "Situación legal — Nota Simple",
          "Valoración financiera IA",
          "Urbanismo",
          "Análisis del entorno (barrio)",
          "Análisis de zona (MVP)",
        ]
      : [
          "Cadastral data",
          "Data extracted from Nota Simple",
          "Executive summary",
          "Investment risk",
          "Legal situation — Nota Simple",
          "AI financial evaluation",
          "Urbanism",
          "Neighborhood analysis",
          "Zone analysis (MVP)",
        ],
    demoNote: es
      ? "Los informes de demostración del menú lateral son ilustrativos y crean un ejemplo en Informes."
      : "Sidebar demo reports are illustrative and create a sample entry under Reports.",
    back: es ? "Volver" : "Back",
  };

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Button>
        </div>

        <div className="rounded-xl glass-card-strong border border-border p-6">
          <div className="flex items-start gap-3">
            <BookOpen className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t.intro}</p>
            </div>
          </div>
        </div>

        <Card className="glass-card-strong border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t.freeTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {t.freeItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-card-strong border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t.pack15Title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {t.pack15Items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-card-strong border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t.pack50Title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {t.pack50Items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 py-1">{t.demoNote}</p>
      </div>
    </div>
  );
}
