import { API_BASE_URL } from "./config";

const json = (body) =>
  fetch(body.url, {
    method: body.method || "GET",
    headers: { "Content-Type": "application/json", ...body.headers },
    ...(body.body && { body: JSON.stringify(body.body) }),
  }).then((r) => {
    if (!r.ok) {
      return r.json().then((d) => Promise.reject(new Error(d.detail || d.error || r.statusText)));
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
