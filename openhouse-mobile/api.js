import { API_BASE_URL } from "./config";

const json = (body) =>
  fetch(body.url, {
    method: body.method || "GET",
    headers: { "Content-Type": "application/json", ...body.headers },
    ...(body.body && { body: JSON.stringify(body.body) }),
  }).then(async (r) => {
    const status = r.status;
    const text = await r.text();
    if (!r.ok) {
      let detail = r.statusText || "Eroare server";
      let body = null;
      try {
        body = JSON.parse(text);
        detail = body.detail ?? body.error ?? detail;
        if (Array.isArray(detail) && detail.length) detail = detail[0].msg || detail[0].message || String(detail[0]);
      } catch (_) {
        if (text) detail = text.slice(0, 200);
      }
      const err = new Error(detail);
      err.status = status;
      err.body = body;
      return Promise.reject(err);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return Promise.reject(new Error("Răspuns invalid de la server (nu e JSON)."));
    }
  });

export async function identificaImobil(lat, lon) {
  return json({
    url: `${API_BASE_URL}/identifica-imobil/`,
    method: "POST",
    body: { lat, lon },
  });
}

export async function ensureGuest(email) {
  return json({
    url: `${API_BASE_URL}/ensure-guest`,
    method: "POST",
    body: { email },
  });
}

export async function createCheckoutSession(propertyId, userId, successUrl, cancelUrl) {
  return json({
    url: `${API_BASE_URL}/create-checkout-session`,
    method: "POST",
    body: { property_id: propertyId, user_id: userId, success_url: successUrl, cancel_url: cancelUrl },
  });
}

export async function getRequestIdBySession(sessionId) {
  return json({
    url: `${API_BASE_URL}/request-id-by-session/${encodeURIComponent(sessionId)}`,
  });
}

export async function getStatusRaport(requestId) {
  return json({
    url: `${API_BASE_URL}/status-raport/${encodeURIComponent(requestId)}`,
  });
}

export async function getCartaOferta(reportId) {
  return json({
    url: `${API_BASE_URL}/raport/${reportId}/carta-oferta`,
  });
}

/**
 * POST /financial-analysis – VestaFinancialEngine (deterministic, <500ms).
 * @param {object} propertyData  { listing_price, sqm }
 * @param {object} marketData    { avg_sqm_price, avg_rent_sqm, city? }
 * @param {number} [whatIfPrice] Optional alternative purchase price for what-if scenario
 * Răspuns: { gross_yield_pct, net_yield_pct, roi_5y_pct, valuation_status,
 *            valuation_diff_pct, opportunity_score, negotiation_note, ... }
 */
export async function getFinancialAnalysis(propertyData = {}, marketData = {}, whatIfPrice = null) {
  const body = { property_data: propertyData, market_data: marketData };
  if (whatIfPrice != null && whatIfPrice > 0) body.what_if_price = whatIfPrice;
  return json({
    url: `${API_BASE_URL}/financial-analysis`,
    method: "POST",
    body,
  });
}

/**
 * GET /market-trend – returnează datele IPV (INE Spain) pentru graficul de trend.
 * Răspuns: { source, data: [{date,value,year,quarter}], capital_appreciation_pct, points }
 */
export async function getMarketTrend() {
  return json({
    url: `${API_BASE_URL}/market-trend`,
  });
}

/** POST /creeaza-plata/ – returnează { clientSecret }; tip=standard|premium, optional email, property_id. */
export async function creeazaPlata(body = {}) {
  return json({
    url: `${API_BASE_URL}/creeaza-plata/`,
    method: "POST",
    body: {
      tip: body.tip ?? "standard",
      email: body.email ?? undefined,
      property_id: body.property_id ?? undefined,
    },
  });
}
