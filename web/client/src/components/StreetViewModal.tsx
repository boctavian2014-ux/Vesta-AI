import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGoogleMapsBrowserKey, loadGoogleMapsJs } from "@/lib/googleMapsLoader";
import type { StreetViewMetadataResult } from "@/types/property";

type StreetViewModalProps = {
  open: boolean;
  lat: number | null;
  lng: number | null;
  title?: string;
  metadata?: StreetViewMetadataResult | null;
  locale: "en" | "es";
  onClose: () => void;
};

type StreetViewUiState =
  | "loading"
  | "ready"
  | "no_streetview"
  | "missing_api_key"
  | "error";

export function StreetViewModal({
  open,
  lat,
  lng,
  title,
  metadata,
  locale,
  onClose,
}: StreetViewModalProps) {
  const t = locale === "es"
    ? {
        defaultTitle: "Inspeccion visual desde la calle",
        close: "Cerrar",
        rotateLeft: "Girar -30",
        rotateRight: "Girar +30",
        zoomIn: "Zoom +",
        zoomOut: "Zoom -",
        reset: "Restablecer",
        missingKey: "Falta la clave de Google Maps JS API.",
        noStreetView: "Street View no disponible",
        addKey: "Agrega VITE_GOOGLE_MAPS_JS_API_KEY (o fallback VITE_GOOGLE_MAPS_EMBED_KEY) en .env.",
        loading: "Cargando Street View...",
        noCoords: "No hay coordenadas para Street View.",
        noAddressView: "No hay Street View para esta direccion.",
        noLocationView: "No hay Street View para esta ubicacion.",
        jsUnavailable: "Google Maps JS no esta disponible.",
        jsLoadError: "Error al cargar Google Maps JS.",
      }
    : {
        defaultTitle: "Street-level visual inspection",
        close: "Close",
        rotateLeft: "Rotate -30",
        rotateRight: "Rotate +30",
        zoomIn: "Zoom +",
        zoomOut: "Zoom -",
        reset: "Reset",
        missingKey: "Missing Google Maps JS API key.",
        noStreetView: "Street View unavailable",
        addKey: "Add VITE_GOOGLE_MAPS_JS_API_KEY (or fallback VITE_GOOGLE_MAPS_EMBED_KEY) in .env.",
        loading: "Loading Street View...",
        noCoords: "No coordinates available for Street View.",
        noAddressView: "No Street View available for this address.",
        noLocationView: "No Street View available for this location.",
        jsUnavailable: "Google Maps JS is unavailable.",
        jsLoadError: "Error loading Google Maps JS.",
      };

  const apiKey = getGoogleMapsBrowserKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<any>(null);
  const initialPovRef = useRef<{ heading: number; pitch: number; zoom: number }>({
    heading: 210,
    pitch: 10,
    zoom: 1,
  });
  const [uiState, setUiState] = useState<StreetViewUiState>("loading");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [povState, setPovState] = useState<{ heading: number; pitch: number; zoom: number }>({
    heading: 210,
    pitch: 10,
    zoom: 1,
  });

  const targetPosition = useMemo(() => {
    if (metadata?.location) {
      return { lat: metadata.location.lat, lng: metadata.location.lng };
    }
    if (lat == null || lng == null) return null;
    return { lat, lng };
  }, [lat, lng, metadata]);

  const syncPovState = useCallback(() => {
    const pano = panoramaRef.current;
    if (!pano) return;
    const pov = pano.getPov?.() ?? { heading: 210, pitch: 10 };
    const zoom = typeof pano.getZoom === "function" ? Number(pano.getZoom() ?? 1) : 1;
    setPovState({
      heading: Number(pov.heading ?? 210),
      pitch: Number(pov.pitch ?? 10),
      zoom: Number.isFinite(zoom) ? zoom : 1,
    });
  }, []);

  const changeHeading = useCallback((delta: number) => {
    const pano = panoramaRef.current;
    if (!pano) return;
    const pov = pano.getPov?.() ?? { heading: 210, pitch: 10 };
    pano.setPov?.({ ...pov, heading: Number(pov.heading ?? 210) + delta });
    syncPovState();
  }, [syncPovState]);

  const changeZoom = useCallback((delta: number) => {
    const pano = panoramaRef.current;
    if (!pano || typeof pano.getZoom !== "function" || typeof pano.setZoom !== "function") return;
    const nextZoom = Number(pano.getZoom() ?? 1) + delta;
    pano.setZoom(Math.max(0, Math.min(5, nextZoom)));
    syncPovState();
  }, [syncPovState]);

  const resetPov = useCallback(() => {
    const pano = panoramaRef.current;
    if (!pano) return;
    pano.setPov?.({
      heading: initialPovRef.current.heading,
      pitch: initialPovRef.current.pitch,
    });
    pano.setZoom?.(initialPovRef.current.zoom);
    syncPovState();
  }, [syncPovState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (!apiKey) {
      setUiState("missing_api_key");
      setStatusMessage(t.missingKey);
      return;
    }
    if (!targetPosition) {
      setUiState("no_streetview");
      setStatusMessage(t.noCoords);
      return;
    }
    if (metadata && metadata.status !== "OK") {
      setUiState("no_streetview");
      setStatusMessage(
        metadata.status === "ZERO_RESULTS"
          ? t.noAddressView
          : metadata.errorMessage || `Street View indisponibil (${metadata.status})`
      );
      return;
    }

    setUiState("loading");
    setStatusMessage(t.loading);

    loadGoogleMapsJs(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const googleMaps = (window as Window & { google?: any }).google?.maps;
        if (!googleMaps) {
          setUiState("error");
          setStatusMessage(t.jsUnavailable);
          return;
        }

        const svService = new googleMaps.StreetViewService();
        svService.getPanorama(
          {
            location: targetPosition,
            radius: metadata?.radius ?? 25,
            source: googleMaps.StreetViewSource.OUTDOOR,
            preference: googleMaps.StreetViewPreference.NEAREST,
          },
          (data: any, status: string) => {
            if (cancelled) return;
            if (status !== "OK" || !data?.location?.pano) {
              setUiState("no_streetview");
              setStatusMessage(t.noLocationView);
              return;
            }

            const panorama = new googleMaps.StreetViewPanorama(containerRef.current, {
              pano: data.location.pano,
              position: data.location.latLng ?? targetPosition,
              pov: { heading: 210, pitch: 10 },
              zoom: 1,
              motionTracking: false,
              addressControl: true,
              linksControl: true,
              panControl: true,
              zoomControl: true,
            });
            panoramaRef.current = panorama;
            initialPovRef.current = { heading: 210, pitch: 10, zoom: 1 };
            setPovState(initialPovRef.current);
            setUiState("ready");
            setStatusMessage("");
            panorama.addListener?.("pov_changed", syncPovState);
            panorama.addListener?.("zoom_changed", syncPovState);
          }
        );
      })
      .catch(() => {
        if (cancelled) return;
        setUiState("error");
        setStatusMessage(t.jsLoadError);
      });

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [apiKey, metadata, open, syncPovState, targetPosition, t.addKey, t.jsLoadError, t.jsUnavailable, t.loading, t.missingKey, t.noAddressView, t.noCoords, t.noLocationView]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm">
      <div className="absolute inset-x-3 bottom-3 top-3 overflow-hidden rounded-2xl glass-card text-card-foreground md:inset-x-8 md:bottom-6 md:top-6">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Street View</h2>
            <p className="truncate text-xs text-muted-foreground">
              {title || t.defaultTitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {t.close}
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => changeHeading(-30)}
            disabled={uiState !== "ready"}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.rotateLeft}
          </button>
          <button
            type="button"
            onClick={() => changeHeading(30)}
            disabled={uiState !== "ready"}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.rotateRight}
          </button>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            disabled={uiState !== "ready"}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.zoomIn}
          </button>
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            disabled={uiState !== "ready"}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.zoomOut}
          </button>
          <button
            type="button"
            onClick={resetPov}
            disabled={uiState !== "ready"}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.reset}
          </button>
          {uiState === "ready" && (
            <span className="ml-auto text-xs text-muted-foreground">
              H {Math.round(povState.heading)} | P {Math.round(povState.pitch)} | Z {povState.zoom.toFixed(1)}
            </span>
          )}
        </div>

        {(uiState === "missing_api_key" || uiState === "no_streetview" || uiState === "error") && (
          <div className="flex h-[calc(100%-97px)] items-center justify-center p-6 text-center">
            <div>
              <p className="text-sm font-medium">
                {uiState === "missing_api_key" ? t.missingKey : t.noStreetView}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {uiState === "missing_api_key"
                  ? t.addKey
                  : statusMessage}
              </p>
            </div>
          </div>
        )}

        {uiState === "loading" && (
          <div className="flex h-[calc(100%-97px)] items-center justify-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{statusMessage || t.loading}</p>
          </div>
        )}

        <div
          ref={containerRef}
          className={uiState === "ready" ? "h-[calc(100%-97px)] w-full" : "hidden"}
        />
      </div>
    </div>
  );
}
