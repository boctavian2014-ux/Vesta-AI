import type { OsmNearbyEssentials } from "./zoneAnalysisOsm";

export function resolveZoneLocale(raw: unknown): "en" | "es" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "es") return "es";
  return "en";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getPriceBand(pricePerSqm: number): "low" | "mid" | "high" {
  if (!Number.isFinite(pricePerSqm) || pricePerSqm <= 0) return "mid";
  if (pricePerSqm >= 3500) return "high";
  if (pricePerSqm <= 1800) return "low";
  return "mid";
}

/** Map view centered on the analysis coordinates (same location as Overpass radius). */
export function buildOpenStreetMapMapUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/#map=17/${lat}/${lon}`;
}

export function buildZoneAnalysisPayload(input: {
  lat: number;
  lon: number;
  address?: string;
  financialData?: Record<string, unknown>;
  tier: "analysis_pack" | "expert_report";
  locale?: "en" | "es";
  osm: OsmNearbyEssentials | null;
}) {
  const locale = input.locale ?? "en";
  const address = String(input.address ?? "").trim();
  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  const city = segments.length > 1 ? segments[segments.length - 2] : segments[0] || "Unknown";
  const district = segments.length > 2 ? segments[segments.length - 3] : city;

  const marketAvgSqm = Number(input.financialData?.marketAvgSqm ?? input.financialData?.pricePerSqm ?? 0);
  const priceBand = getPriceBand(marketAvgSqm);

  const coordSignal = Math.abs(Math.round((input.lat + input.lon) * 10)) % 10;

  const osm = input.osm;
  const schoolsNearby = osm ? osm.schools_nearby : 5;
  const hospitalsNearby = osm ? osm.hospitals_nearby : 2;
  const policeNearby = osm ? osm.police_nearby : 1 + (coordSignal % 2);
  const attractionsNearby = osm ? osm.attractions_nearby : 2;
  const transitStops = osm ? osm.transit_stops_nearby : 4 + (coordSignal % 6);

  const pricingScore = priceBand === "high" ? 72 : priceBand === "mid" ? 66 : 61;
  const servicesScore = clampScore(
    55 + Math.min(schoolsNearby, 12) * 4 + Math.min(hospitalsNearby, 8) * 6 + Math.min(transitStops, 12) * 2,
  );
  const safetyScore = clampScore(68 - coordSignal * 3 + Math.min(policeNearby, 6) * 4);
  const attractivenessScore = clampScore(58 + Math.min(attractionsNearby, 10) * 5);
  const finalOpportunity = clampScore(
    pricingScore * 0.3 + servicesScore * 0.25 + safetyScore * 0.2 + attractivenessScore * 0.25,
  );

  const highlights =
    locale === "es"
      ? [
          `${schoolsNearby} ${schoolsNearby === 1 ? "centro educativo" : "centros educativos"} en OpenStreetMap cerca`,
          `${hospitalsNearby} ${hospitalsNearby === 1 ? "hospital/clínica" : "hospitales/clínicas"} en OpenStreetMap cerca`,
          `${attractionsNearby} ${attractionsNearby === 1 ? "punto de interés" : "puntos de interés"} en OpenStreetMap cerca`,
        ]
      : [
          `${schoolsNearby} mapped ${schoolsNearby === 1 ? "school" : "schools"} nearby (OpenStreetMap)`,
          `${hospitalsNearby} mapped ${hospitalsNearby === 1 ? "hospital/clinic" : "hospitals/clinics"} nearby (OpenStreetMap)`,
          `${attractionsNearby} mapped ${attractionsNearby === 1 ? "point of interest" : "points of interest"} nearby (OpenStreetMap)`,
        ];

  if (!osm) {
    if (locale === "es") {
      highlights[0] = `${schoolsNearby} colegios (estimación; sin datos OSM)`;
      highlights[1] = `${hospitalsNearby} hospitales/clínicas (estimación; sin datos OSM)`;
      highlights[2] = `${attractionsNearby} puntos de interés (estimación; sin datos OSM)`;
    } else {
      highlights[0] = `${schoolsNearby} schools (estimate; OSM unavailable)`;
      highlights[1] = `${hospitalsNearby} hospitals/clinics (estimate; OSM unavailable)`;
      highlights[2] = `${attractionsNearby} points of interest (estimate; OSM unavailable)`;
    }
  }

  const cautions =
    locale === "es"
      ? [
          osm
            ? "Los conteos reflejan OpenStreetMap (puede estar incompleto). Validación manual recomendada para la micro-ubicación exacta."
            : "Validación manual recomendada para la micro-ubicación exacta",
        ]
      : [
          osm
            ? "Counts reflect OpenStreetMap (may be incomplete). Manual validation recommended for exact micro-location."
            : "Manual validation recommended for exact micro-location",
        ];

  return {
    snapshot: {
      city,
      district,
      market_price_per_m2: Number.isFinite(marketAvgSqm) && marketAvgSqm > 0 ? Math.round(marketAvgSqm) : null,
      price_band: priceBand,
      tier: input.tier,
      essentials_source: osm ? ("openstreetmap_overpass" as const) : ("estimated_fallback" as const),
      openstreetmap_url: buildOpenStreetMapMapUrl(input.lat, input.lon),
    },
    nearby_essentials: {
      schools_nearby: schoolsNearby,
      hospitals_nearby: hospitalsNearby,
      police_nearby: policeNearby,
      transit_stops_nearby: transitStops,
      attractions_nearby: attractionsNearby,
    },
    safety_liquidity: {
      safety_score: safetyScore,
      liquidity_score: pricingScore,
      risk_level: safetyScore >= 70 ? "low" : safetyScore >= 50 ? "medium" : "high",
      summary:
        locale === "es"
          ? safetyScore >= 70
            ? "Zona con perfil relativamente estable para inversión."
            : safetyScore >= 50
              ? "Zona con riesgo moderado; conviene verificación periódica."
              : "Zona de mayor riesgo; recomendamos un análisis prudente."
          : safetyScore >= 70
            ? "Area with a relatively stable profile for investment."
            : safetyScore >= 50
              ? "Moderate-risk area; periodic verification is advisable."
              : "Higher-risk area; prudent analysis is recommended.",
    },
    poi_attractiveness: {
      highlights,
      cautions,
    },
    final_opportunity: {
      score: finalOpportunity,
      breakdown: {
        pricing: pricingScore,
        services: servicesScore,
        safety: safetyScore,
        attractiveness: attractivenessScore,
      },
    },
  };
}
