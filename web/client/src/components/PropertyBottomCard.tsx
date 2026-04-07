import type { PropertyPin } from "@/types/property";
import type { StreetViewMetadataResult } from "@/types/property";

type PropertyBottomCardProps = {
  property: PropertyPin | null;
  checkingStreetView: boolean;
  streetViewMeta: StreetViewMetadataResult | null;
  locale: "en" | "es";
  onOpenStreetView: () => void;
  onClose: () => void;
  /** Hide bottom card only; map / panel stay as-is (satellite view). */
  onKeepSatellite: () => void;
};

export function PropertyBottomCard({
  property,
  checkingStreetView,
  streetViewMeta,
  locale,
  onOpenStreetView,
  onClose,
  onKeepSatellite,
}: PropertyBottomCardProps) {
  if (!property) return null;

  const t = locale === "es"
    ? {
        checking: "Comprobando Street View...",
        available: "Street View disponible",
        unavailable: "Street View no disponible",
        score: "Puntuacion",
        close: "Cerrar",
        openStreet: "Ver desde la calle",
        keepSatellite: "Mantener satelite",
      }
    : {
        checking: "Checking Street View...",
        available: "Street View available",
        unavailable: "Street View unavailable",
        score: "Opportunity score",
        close: "Close",
        openStreet: "View from street",
        keepSatellite: "Keep satellite",
      };

  const streetViewStatus = checkingStreetView
    ? t.checking
    : streetViewMeta?.status === "OK"
      ? t.available
      : streetViewMeta?.status ?? t.unavailable;
  const canOpenStreetView = !checkingStreetView && streetViewMeta?.status === "OK";

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 max-w-[min(92vw,240px)] rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-md md:left-3 md:right-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="map-overlay-text truncate text-[11px] font-semibold leading-tight">{property.title}</h3>
          {property.address ? (
            <p className="map-overlay-text-muted mt-0.5 line-clamp-2 text-[10px] leading-snug">
              {property.address}
            </p>
          ) : (
            <p className="map-overlay-text-muted mt-0.5 font-mono text-[10px]">
              {property.lat.toFixed(5)}, {property.lng.toFixed(5)}
            </p>
          )}

          {typeof property.opportunityScore === "number" && (
            <div className="mt-1.5 inline-flex max-w-full rounded-full border border-white/20 bg-black/30 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
              <span className="map-overlay-text-muted truncate">
                {t.score}: {property.opportunityScore}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="map-overlay-text-muted shrink-0 rounded border border-white/30 px-1.5 py-0.5 text-[10px] hover:bg-white/10"
        >
          {t.close}
        </button>
      </div>

      <div className="map-overlay-text-muted mt-1 line-clamp-2 text-[10px] leading-snug">{streetViewStatus}</div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onOpenStreetView}
          disabled={!canOpenStreetView}
          className="inline-flex flex-1 min-w-0 items-center justify-center rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.openStreet}
        </button>

        <button
          type="button"
          onClick={onKeepSatellite}
          className="map-overlay-text-muted inline-flex flex-1 min-w-0 items-center justify-center rounded border border-white/30 px-2 py-1 text-[10px] hover:bg-white/10"
        >
          {t.keepSatellite}
        </button>
      </div>
    </div>
  );
}
