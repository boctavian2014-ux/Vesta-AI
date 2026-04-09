/**
 * OpenStreetMap counts via Overpass API (real POI proximity, not heuristic).
 * Uses public Overpass instance unless VESTA_OVERPASS_URL is set.
 * Set VESTA_ZONE_OSM_DISABLE=1 to skip network calls (tests / offline).
 */

export type OsmNearbyEssentials = {
  schools_nearby: number;
  hospitals_nearby: number;
  police_nearby: number;
  transit_stops_nearby: number;
  attractions_nearby: number;
  queried: boolean;
  overpassUrl: string;
};

const DEFAULT_OVERPASS = "https://overpass-api.de/api/interpreter";

function overpassDisabled(): boolean {
  return ["1", "true", "yes"].includes(String(process.env.VESTA_ZONE_OSM_DISABLE || "").toLowerCase());
}

function overpassUrl(): string {
  const u = String(process.env.VESTA_OVERPASS_URL || DEFAULT_OVERPASS).trim();
  return u.replace(/\/$/, "");
}

type OsmEl = { type: string; id: number; tags?: Record<string, string> };

function categorize(el: OsmEl): Set<"school" | "hospital" | "police" | "transit" | "attraction"> {
  const t = el.tags ?? {};
  const a = (t.amenity || "").toLowerCase();
  const hw = (t.highway || "").toLowerCase();
  const rw = (t.railway || "").toLowerCase();
  const pt = (t.public_transport || "").toLowerCase();
  const tour = (t.tourism || "").toLowerCase();
  const hist = (t.historic || "").toLowerCase();
  const cats = new Set<"school" | "hospital" | "police" | "transit" | "attraction">();

  if (["school", "kindergarten", "college", "university"].includes(a)) cats.add("school");
  if (["hospital", "clinic", "doctors"].includes(a)) cats.add("hospital");
  if (a === "police") cats.add("police");
  if (hw === "bus_stop" || rw === "tram_stop" || pt === "stop_position" || pt === "platform") {
    cats.add("transit");
  }
  if (tour === "attraction" || tour === "museum" || hist === "monument") cats.add("attraction");

  return cats;
}

/**
 * Query OSM around (lat, lon). Returns null on failure (caller should use MVP fallback).
 */
export async function fetchOsmNearbyEssentials(
  lat: number,
  lon: number,
  opts?: { radiusSchoolsM?: number; radiusTransitM?: number },
): Promise<OsmNearbyEssentials | null> {
  if (overpassDisabled()) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const rSchool = Math.min(2000, Math.max(200, opts?.radiusSchoolsM ?? 800));
  const rTransit = Math.min(1200, Math.max(150, opts?.radiusTransitM ?? 450));

  const q = `
[out:json][timeout:25];
(
  nwr["amenity"="school"](around:${rSchool},${lat},${lon});
  nwr["amenity"="kindergarten"](around:${rSchool},${lat},${lon});
  nwr["amenity"="college"](around:${rSchool},${lat},${lon});
  nwr["amenity"="university"](around:${rSchool},${lat},${lon});
  nwr["amenity"="hospital"](around:${rSchool},${lat},${lon});
  nwr["amenity"="clinic"](around:${rSchool},${lat},${lon});
  nwr["amenity"="doctors"](around:${rSchool},${lat},${lon});
  nwr["amenity"="police"](around:${rSchool},${lat},${lon});
  nwr["highway"="bus_stop"](around:${rTransit},${lat},${lon});
  nwr["railway"="tram_stop"](around:${rTransit},${lat},${lon});
  nwr["public_transport"="stop_position"](around:${rTransit},${lat},${lon});
  nwr["public_transport"="platform"](around:${rTransit},${lat},${lon});
  nwr["tourism"="attraction"](around:${rSchool},${lat},${lon});
  nwr["tourism"="museum"](around:${rSchool},${lat},${lon});
  nwr["historic"="monument"](around:${rSchool},${lat},${lon});
);
out center;
`;

  const url = overpassUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: `data=${encodeURIComponent(q)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "VestaWeb/1.0 (property zone analysis; contact: support@vesta)",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { elements?: OsmEl[] };
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const seen = new Set<string>();
    let schools = 0;
    let hospitals = 0;
    let police = 0;
    let transit = 0;
    let attractions = 0;

    for (const el of elements) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const c of categorize(el)) {
        if (c === "school") schools += 1;
        else if (c === "hospital") hospitals += 1;
        else if (c === "police") police += 1;
        else if (c === "transit") transit += 1;
        else if (c === "attraction") attractions += 1;
      }
    }

    return {
      schools_nearby: schools,
      hospitals_nearby: hospitals,
      police_nearby: police,
      transit_stops_nearby: transit,
      attractions_nearby: attractions,
      queried: true,
      overpassUrl: url,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
