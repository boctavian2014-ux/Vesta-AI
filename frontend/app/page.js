"use client";

import Map, { Marker } from "react-map-gl";
import { useCallback, useState } from "react";

const MADRID = { longitude: -3.7037, latitude: 40.4167, zoom: 15 };

function culoareScor(scor) {
  if (scor == null) return "#9ca3af";
  if (scor < 20) return "#22c55e";
  if (scor <= 50) return "#eab308";
  return "#dc2626";
}

function labelScor(scor) {
  if (scor == null) return "—";
  if (scor < 20) return "Verde (locuită / recentă)";
  if (scor <= 50) return "Galben (posibil interesantă)";
  return "Roșu (oportunitate)";
}

export default function HomePage() {
  const [selectedProp, setSelectedProp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: MADRID.longitude,
    latitude: MADRID.latitude,
    zoom: MADRID.zoom,
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const handleMapClick = useCallback(
    async (event) => {
      const { lng, lat } = event.lngLat;
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}/identifica-imobil/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon: lng }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Eroare la identificare");
        setSelectedProp(data.data);
      } catch (err) {
        setError(err.message);
        setSelectedProp(null);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl]
  );

  const handleBuyReport = useCallback(async () => {
    if (!selectedProp) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Introdu emailul pentru a primi raportul.");
      return;
    }
    setError(null);
    setPayLoading(true);
    try {
      const guestRes = await fetch(`${apiUrl}/ensure-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const guestData = await guestRes.json();
      if (!guestRes.ok) throw new Error(guestData.detail || "Eroare guest");

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const checkoutRes = await fetch(`${apiUrl}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: selectedProp.id,
          user_id: guestData.user_id,
          success_url: `${origin}/success`,
          cancel_url: `${origin}/`,
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.detail || "Eroare Stripe");
      if (checkoutData.checkout_url) {
        window.location.href = checkoutData.checkout_url;
        return;
      }
      throw new Error("Nu s-a primit URL de plată.");
    } catch (err) {
      setError(err.message);
    } finally {
      setPayLoading(false);
    }
  }, [selectedProp, email, apiUrl]);

  if (!mapboxToken) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p>Configurează <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> în <code>.env.local</code>.</p>
        <p>Copiază din <code>.env.local.example</code> și adaugă token-ul de pe <a href="https://account.mapbox.com/access-tokens/">Mapbox</a>.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {/* Harta – ~70% */}
      <div style={{ flex: "3", minWidth: 0, position: "relative" }}>
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          mapboxAccessToken={mapboxToken}
          onClick={handleMapClick}
          style={{ width: "100%", height: "100%" }}
          cursor={loading ? "wait" : "crosshair"}
        >
          {selectedProp && (
            <Marker
              longitude={selectedProp.lon}
              latitude={selectedProp.lat}
              anchor="bottom"
              color={culoareScor(selectedProp.scor_oportunitate)}
            />
          )}
        </Map>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.7)",
              color: "white",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            Se identifică imobilul…
          </div>
        )}
      </div>

      {/* Sidebar – ~30% */}
      <aside
        style={{
          flex: "1",
          minWidth: 280,
          maxWidth: 420,
          padding: 24,
          backgroundColor: "#fff",
          boxShadow: "-2px 0 12px rgba(0,0,0,0.08)",
          overflowY: "auto",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          OpenHouse Spain
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
          Dă click pe o casă pe hartă pentru detalii. Raport Nota Simple: 19€.
        </p>

        {error && (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              background: "#fef2f2",
              color: "#b91c1c",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {selectedProp ? (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              Detalii proprietate
            </h2>
            <p style={{ marginBottom: 6 }}>
              <strong>Ref. cadastrală:</strong>{" "}
              <code style={{ fontSize: 13 }}>{selectedProp.ref_catastral}</code>
            </p>
            <p style={{ marginBottom: 6 }}>
              <strong>Adresă:</strong>{" "}
              {selectedProp.address || "—"}
            </p>
            <p style={{ marginBottom: 6 }}>
              <strong>An construcție:</strong>{" "}
              {selectedProp.year_built ?? "—"}
            </p>
            <p style={{ marginBottom: 16 }}>
              <strong>Scor oportunitate:</strong>{" "}
              {selectedProp.scor_oportunitate ?? "—"} — {labelScor(selectedProp.scor_oportunitate)}
            </p>
            {selectedProp.stare_piscina && (
              <p style={{ marginBottom: 16 }}>
                <strong>Stare piscină (satelit):</strong>{" "}
                <span style={{ color: selectedProp.stare_piscina === "CRITIC" ? "#b91c1c" : "#15803d" }}>
                  {selectedProp.stare_piscina === "CRITIC" ? "Piscină abandonată" : "Întreținut"}
                </span>
              </p>
            )}

            <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
              Email (pentru raport și notificare)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 14,
              }}
            />

            <button
              onClick={handleBuyReport}
              disabled={payLoading}
              style={{
                width: "100%",
                background: "#6772e5",
                color: "white",
                padding: "12px 20px",
                border: "none",
                borderRadius: 8,
                cursor: payLoading ? "wait" : "pointer",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {payLoading ? "Se deschide plata…" : "Cumpără raport proprietar (19€)"}
            </button>
          </div>
        ) : (
          <p style={{ color: "#64748b", fontSize: 14 }}>
            Dă click pe o casă de pe hartă (vedere satelit) pentru a vedea detaliile și pentru a comanda raportul.
          </p>
        )}
      </aside>
    </div>
  );
}
