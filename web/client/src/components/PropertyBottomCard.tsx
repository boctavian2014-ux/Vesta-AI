import { Eye, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PropertyPin, StreetViewMetadataResult } from "@/types/property";

type PropertyBottomCardProps = {
  property: PropertyPin;
  checkingStreetView: boolean;
  streetViewMeta: StreetViewMetadataResult | null;
  locale: "en" | "es";
  onOpenStreetView: () => void;
  onClose: () => void;
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
  const t = locale === "es"
    ? {
        selectedProperty: "Inmueble seleccionado",
        coordinates: "Coordenadas",
        streetView: "Street View",
        checkingStreetView: "Verificando Street View...",
        streetViewUnavailable: "Street View no disponible",
        keepSatellite: "Solo mapa",
      }
    : {
        selectedProperty: "Selected property",
        coordinates: "Coordinates",
        streetView: "Street View",
        checkingStreetView: "Checking Street View...",
        streetViewUnavailable: "Street View unavailable",
        keepSatellite: "Map only",
      };

  const streetViewAvailable = !checkingStreetView && streetViewMeta?.status === "OK";

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[12] md:inset-x-6 md:bottom-6">
      <div className="pointer-events-auto rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70">{t.selectedProperty}</p>
            <p className="truncate text-sm font-semibold">{property.title}</p>
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">
              <MapPin className="mr-1 inline h-3 w-3" />
              {t.coordinates}: {property.lat.toFixed(5)}, {property.lng.toFixed(5)}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 rounded-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={onClose}
            aria-label="Close selected property card"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={onOpenStreetView}
            disabled={!streetViewAvailable}
          >
            <Eye className="h-3.5 w-3.5" />
            {t.streetView}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={onKeepSatellite}
          >
            {t.keepSatellite}
          </Button>
          {checkingStreetView && (
            <span className="ml-auto text-[11px] text-sidebar-foreground/70">{t.checkingStreetView}</span>
          )}
          {!checkingStreetView && !streetViewAvailable && (
            <span className="ml-auto text-[11px] text-sidebar-foreground/70">{t.streetViewUnavailable}</span>
          )}
        </div>
      </div>
    </div>
  );
}
