/**
 * Single shared loader for Maps JavaScript API (Map + Street View + services).
 */

let mapsLoaderPromise: Promise<void> | null = null;

export function getGoogleMapsBrowserKey(): string | undefined {
  return (
    (import.meta.env.VITE_GOOGLE_MAPS_JS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined) ||
    // Backward compatibility for older env naming.
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)
  );
}

export function loadGoogleMapsJs(apiKey: string): Promise<void> {
  const win = window as Window & { google?: { maps?: { Map?: unknown } } };
  if (win.google?.maps?.Map) {
    return Promise.resolve();
  }
  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    const timeoutId = window.setTimeout(() => {
      mapsLoaderPromise = null;
      reject(new Error("Google Maps JS load timed out"));
    }, 15000);
    script.onload = () => {
      window.clearTimeout(timeoutId);
      if (win.google?.maps?.Map) {
        resolve();
        return;
      }
      mapsLoaderPromise = null;
      reject(new Error("Google Maps JS loaded, but maps API is unavailable"));
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      mapsLoaderPromise = null;
      reject(new Error("Google Maps JS failed to load"));
    };
    document.head.appendChild(script);
  });
  return mapsLoaderPromise;
}
