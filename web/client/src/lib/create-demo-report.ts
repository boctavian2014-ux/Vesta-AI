import { apiRequest } from "@/lib/queryClient";
import type { AppLocale } from "@/lib/locale";

export type DemoProductTier = "analysis_pack" | "expert_report";

export const DEMO_MAP_COORDS_MADRID = { lat: 40.4168, lon: -3.7038 } as const;

export function defaultDemoPropertyInfo(locale: AppLocale): Record<string, unknown> {
  return {
    address: locale === "es" ? "Calle Demo 12, 28013 Madrid, España" : "12 Demo Street, 28013 Madrid, Spain",
    referenciaCatastral: "DEMO-CATASTRO-ES",
    municipio: "Madrid",
    provincia: "Madrid",
    superficie: 88,
    uso: locale === "es" ? "Residencial" : "Residential",
    anoConstruccion: 1998,
  };
}

/**
 * Rich financial snapshot for sidebar / preview demos so "Financial analysis" renders like a paid report.
 * Keys match what report-detail expects on `financialJson` (camelCase from API normalizer).
 */
export function demoFinancialData(tier: DemoProductTier, locale: AppLocale): Record<string, unknown> {
  const expert = tier === "expert_report";
  return {
    grossYield: expert ? 6.35 : 6.1,
    netYield: expert ? 4.72 : 4.55,
    roi: expert ? 31.2 : 29.4,
    opportunityScore: expert ? 72 : 68,
    pricePerSqm: expert ? 3120 : 2980,
    estimatedValue: expert ? 248000 : 232000,
    monthlyRent: expert ? 1180 : 1100,
    annualRentEstimate: expert ? 14160 : 13200,
    marketAvgSqm: expert ? 3150 : 3020,
    avgRentPerSqm: expert ? 14.2 : 13.5,
    annualCagrPct: 4.1,
    capitalAppreciation5yPct: expert ? 19.2 : 17.8,
    ineCapitalAppreciationPct: 12.3,
    ineDataPoints: 40,
    dataSource:
      locale === "es"
        ? "Motor Vesta + supuestos zona Madrid + serie INE IPV (demo)"
        : "Vesta engine + Madrid zone priors + INE IPV series (demo)",
    valuationStatus:
      locale === "es"
        ? "Ligeramente por encima de la media de zona (demo)"
        : "Slightly above zone average (demo)",
    valuationDiffPct: expert ? 4.5 : 3.8,
    yieldVsBenchmark: 1.9,
    negotiationNote:
      locale === "es"
        ? "Texto orientativo para negociación (demo). Los valores reales dependen del anuncio, tasación y estado de la vivienda."
        : "Sample negotiation guidance (demo). Real figures depend on listing, survey, and property condition.",
  };
}

export type CreateCompletedDemoReportOptions = {
  locale: AppLocale;
  coords: { lat: number; lon: number };
  propertyInfo?: Record<string, unknown>;
  financialData?: Record<string, unknown>;
};

function txt(locale: AppLocale, en: string, es: string) {
  return locale === "es" ? es : en;
}

function buildDemoPayload(
  tier: DemoProductTier,
  zoneAnalysis: unknown,
  locale: AppLocale,
  propertyInfo: Record<string, unknown>,
) {
  const address = (propertyInfo.address as string) ?? txt(locale, "Demo property, Spain", "Propiedad demo, España");
  const refCat = (propertyInfo.referenciaCatastral as string) ?? "DEMO-CATASTRO";

  const demoReport =
    tier === "analysis_pack"
      ? {
          executive_summary: txt(
            locale,
            "Demo: the opportunity analysis indicates a medium-risk profile, with stable long-term rental yield potential.",
            "Demo: el analisis de oportunidad indica un perfil de riesgo medio, con potencial de rentabilidad estable para alquiler a largo plazo.",
          ),
          risk: {
            score: 46,
            level: "medium",
            drivers: [
              txt(locale, "Dependence on micro-area rental dynamics", "Dependencia de la dinamica del alquiler en la microzona"),
              txt(locale, "Medium resale liquidity", "Liquidez media en reventa"),
              txt(locale, "Requires a minimum renovation budget for optimization", "Requiere un presupuesto minimo de reforma para optimizar"),
            ],
          },
          financials: {
            market_value_min: 188000,
            market_value_max: 209000,
            expected_rent_min: 950,
            expected_rent_max: 1180,
            gross_yield_percent: 6.1,
            roi_5_years_percent: 29.4,
            price_per_m2_zone: 2980,
            price_per_m2_ai_estimate: 3120,
            valuation_confidence_score: 79,
          },
          urbanism: {
            comment: txt(
              locale,
              "No major signs of urban planning non-compliance were identified in the demo data.",
              "No hay senales importantes de incumplimiento urbanistico en los datos demo.",
            ),
            registered_built_m2: 84,
            estimated_built_m2: 86,
            discrepancy_percent: 2.3,
            suspected_illegal_works: false,
          },
          neighborhood: {
            pros: [
              txt(locale, "Strong rental demand", "Buena demanda de alquiler"),
              txt(locale, "Nearby urban services", "Servicios urbanos cercanos"),
              txt(locale, "Good connectivity", "Buena conectividad"),
            ],
            cons: [txt(locale, "Higher competition in similar segment", "Mayor competencia en el segmento similar")],
          },
          zone_analysis: zoneAnalysis,
        }
      : {
          executive_summary: txt(
            locale,
            "Demo: expert package focused on legal due diligence and investment risk for the asset.",
            "Demo: paquete experto con foco en due diligence legal y riesgo de inversion del activo.",
          ),
          risk: {
            score: 58,
            level: "medium",
            drivers: [
              txt(locale, "Active encumbrance requires notarial verification", "La carga activa requiere verificacion notarial"),
              txt(locale, "Requires confirmation of registration history", "Requiere confirmacion del historial registral"),
            ],
          },
          legal: {
            summary: txt(
              locale,
              "There are elements that require additional legal validation before signing.",
              "Hay elementos que requieren validacion juridica adicional antes de firmar.",
            ),
            active_mortgages: [txt(locale, "Registered active mortgage (demo)", "Hipoteca activa inscrita (demo)")],
            encumbrances: [txt(locale, "Possible administrative limitation (demo)", "Posible limitacion administrativa (demo)")],
            red_flags: [txt(locale, "Manual verification recommended for annexes", "Se recomienda verificacion manual de anexos")],
          },
          financials: {
            market_value_min: 202000,
            market_value_max: 224000,
            expected_rent_min: 1100,
            expected_rent_max: 1320,
            gross_yield_percent: 6.4,
            roi_5_years_percent: 31.2,
            price_per_m2_zone: 3150,
            price_per_m2_ai_estimate: 3290,
            valuation_confidence_score: 76,
          },
          urbanism: {
            comment: txt(
              locale,
              "Good consistency between cadastral data and observed configuration (demo).",
              "Buena concordancia entre los datos catastrales y la configuracion observada (demo).",
            ),
            registered_built_m2: 96,
            estimated_built_m2: 98,
            discrepancy_percent: 2.1,
            suspected_illegal_works: false,
          },
          neighborhood: {
            pros: [
              txt(locale, "Area sought by tenants", "Zona demandada por inquilinos"),
              txt(locale, "Good transport access", "Buen acceso al transporte"),
              txt(locale, "Appreciation potential", "Potencial de apreciacion"),
            ],
            cons: [txt(locale, "Sensitive to interest rate variation", "Sensible a variaciones de tipos de interes")],
          },
          zone_analysis: zoneAnalysis,
        };

  if (tier === "analysis_pack") {
    return { demoReport, demoNotaSimple: null as null };
  }

  const demoNotaSimple = {
    titular: "DEMO OWNER S.L.",
    direccion: address,
    cargas: txt(locale, "Possible active mortgage (demo).", "Posible hipoteca activa (demo)."),
    caducidad_cargas: txt(locale, "Registry verification needed for exact dates.", "Se requiere verificacion registral para fechas exactas."),
    structured: {
      owner: {
        names: ["DEMO OWNER S.L."],
        ownership_type: "Plena propiedad",
        ownership_share: "100%",
      },
      property: {
        address,
        property_type: "Vivienda",
        idufir_cru: "DEMO-CRU-12345",
        registry_reference: "DEMO-REG-98765",
        cadastral_reference: refCat,
        built_area_m2: 96,
        usable_area_m2: 88,
      },
      debts: {
        total_known_amount_eur: 42000,
        has_active_debts: true,
        items: [
          {
            type: "hipoteca",
            creditor: txt(locale, "Financial entity (demo)", "Entidad financiera (demo)"),
            amount_eur: 42000,
            rank: "1",
            maturity_or_expiry_date: "2034-06-01",
            notes: txt(locale, "Requires up-to-date confirmation at the Land Registry.", "Requiere confirmacion actualizada en el Registro."),
          },
        ],
      },
      risk: {
        legal_risk_level: "medium",
        legal_risk_reasons: [
          txt(locale, "Active encumbrance requires final registry confirmation", "La carga activa requiere confirmacion registral final"),
          txt(locale, "Full notarial validation is recommended", "Se recomienda validacion notarial completa"),
        ],
      },
    },
  };

  return { demoReport, demoNotaSimple };
}

/** Creates a completed report row with the same demo payloads as the map preview. */
export async function createCompletedDemoReport(
  tier: DemoProductTier,
  opts: CreateCompletedDemoReportOptions,
): Promise<{ id: number }> {
  const { locale, coords, propertyInfo = {}, financialData: financialDataIn } = opts;
  const financialData =
    financialDataIn && Object.keys(financialDataIn).length > 0
      ? financialDataIn
      : demoFinancialData(tier, locale);
  const address = (propertyInfo.address as string) ?? "";

  const zoneRes = await apiRequest("POST", "/api/zone/analysis", {
    lat: coords.lat,
    lon: coords.lon,
    address,
    financialData,
    tier,
    locale,
  });
  const zonePayload = (await zoneRes.json()) as { zoneAnalysis?: unknown };
  const zoneAnalysis = zonePayload?.zoneAnalysis ?? null;

  const { demoReport, demoNotaSimple } = buildDemoPayload(tier, zoneAnalysis, locale, propertyInfo);

  const reportRes = await apiRequest("POST", "/api/reports", {
    type: tier,
    status: "completed",
    referenciaCatastral: (propertyInfo.referenciaCatastral as string) ?? "",
    address,
    cadastralJson: JSON.stringify(propertyInfo),
    financialJson: JSON.stringify(financialData),
    reportJson: JSON.stringify(demoReport),
    notaSimpleJson: demoNotaSimple ? JSON.stringify(demoNotaSimple) : null,
    stripeSessionId: `demo_preview_${Date.now()}`,
    mapLat: String(coords.lat),
    mapLon: String(coords.lon),
  });
  return reportRes.json() as Promise<{ id: number }>;
}
