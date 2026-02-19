import { API_BASE_URL } from "./config";

const json = (body) =>
  fetch(body.url, {
    method: body.method || "GET",
    headers: { "Content-Type": "application/json", ...body.headers },
    ...(body.body && { body: JSON.stringify(body.body) }),
  }).then((r) => {
    if (!r.ok) {
      const status = r.status;
      return r
        .json()
        .then((d) => {
          let detail = d.detail ?? d.error ?? r.statusText ?? "Eroare server";
          if (Array.isArray(detail) && detail.length) detail = detail[0].msg || detail[0].message || String(detail[0]);
          return Promise.reject(new Error(detail));
        })
        .catch((e) => Promise.reject(new Error(e.message || r.statusText || `Eroare server (${status})`)));
    }
    return r.json();
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
