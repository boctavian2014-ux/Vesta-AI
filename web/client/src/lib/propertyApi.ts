import { apiRequest } from "@/lib/queryClient";
import type { IdentifiedProperty, StreetViewMetadataResult } from "@/types/property";

export async function identifyProperty(lat: number, lon: number): Promise<IdentifiedProperty> {
  const res = await apiRequest("POST", "/api/property/identify", { lat, lon });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Property not found");
  }
  return res.json();
}

export async function checkStreetViewAvailability(
  lat: number,
  lng: number,
  options?: {
    source?: "default" | "outdoor";
    radius?: number;
  }
): Promise<StreetViewMetadataResult> {
  const apiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_JS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined);
  const source = options?.source ?? "outdoor";
  const radius = options?.radius ?? 25;
  if (!apiKey) {
    return { status: "MISSING_API_KEY", ok: false };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("source", source);
    url.searchParams.set("radius", String(radius));

    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));
    const status = typeof data?.status === "string" ? data.status : "UNKNOWN";
    const errorMessage =
      typeof data?.error_message === "string"
        ? data.error_message
        : typeof data?.errorMessage === "string"
          ? data.errorMessage
          : undefined;
    const location =
      typeof data?.location?.lat === "number" && typeof data?.location?.lng === "number"
        ? {
            lat: data.location.lat,
            lng: data.location.lng,
            panoId: typeof data?.location?.pano === "string" ? data.location.pano : undefined,
          }
        : undefined;

    return { status, ok: status === "OK", errorMessage, location, source, radius };
  } catch {
    return { status: "ERROR", ok: false, errorMessage: "Street View check failed" };
  }
}
