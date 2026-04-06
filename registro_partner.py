"""
Adapter pentru intermediari Nota Simple / Registro.
REGISTRO_PARTNER_PROVIDER=generic (implicit) | unodata (placeholder până la spec).

Normalizare webhook inbound și construire payload outbound.
"""
from __future__ import annotations

import os
from typing import Any, Optional

PROVIDER = os.getenv("REGISTRO_PARTNER_PROVIDER", "generic").strip().lower()


def build_order_payload(
    *,
    partner_url: str,
    external_request_id: str,
    ref_catastral: str,
    report_id: int,
    property_id: int,
    product_tier: str,
    callback_url: str,
) -> tuple[dict[str, Any], dict[str, str]]:
    """
    Returnează (json_body, extra_headers).
    Pentru 'unodata' poți remapă când ai documentația; până atunci = generic.
    """
    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = os.getenv("REGISTRO_PARTNER_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    if PROVIDER == "unodata":
        # Placeholder — înlocuiește câmpurile după contractul Unodata
        body: dict[str, Any] = {
            "order_reference": external_request_id,
            "cadastral_reference": ref_catastral,
            "callback_url": callback_url,
            "metadata": {
                "report_id": report_id,
                "property_id": property_id,
                "product_tier": product_tier,
            },
        }
        return body, headers

    body = {
        "external_request_id": external_request_id,
        "referencia_catastral": ref_catastral,
        "report_id": report_id,
        "property_id": property_id,
        "product_tier": product_tier,
        "callback_url": callback_url,
    }
    return body, headers


def normalize_registro_webhook(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Uniformizează răspunsul intermediarului către câmpurile folosite de main.webhook_registru.
    Output keys: request_id, status, owner_name, pdf_link, cargas_resumen, pdf_base64 (optional)
    """
    if PROVIDER == "unodata":
        rid = raw.get("request_id") or raw.get("order_id") or raw.get("external_request_id")
        pdf = raw.get("pdf_url") or raw.get("document_url") or raw.get("pdf_link")
        return {
            "request_id": rid,
            "status": raw.get("status", "completed"),
            "owner_name": raw.get("owner_name") or raw.get("titular"),
            "pdf_link": pdf,
            "cargas_resumen": raw.get("cargas_resumen") or raw.get("cargas"),
            "pdf_base64": raw.get("pdf_base64"),
        }

    return {
        "request_id": raw.get("request_id"),
        "status": raw.get("status", "completed"),
        "owner_name": raw.get("owner_name"),
        "pdf_link": raw.get("pdf_link"),
        "cargas_resumen": raw.get("cargas_resumen"),
        "pdf_base64": raw.get("pdf_base64"),
    }


def poll_order_status_placeholder(order_ref: str) -> Optional[dict[str, Any]]:
    """
    Fallback polling — implementează când REGISTRO_PARTNER_POLL_URL + spec există.
    """
    poll_url = os.getenv("REGISTRO_PARTNER_POLL_URL", "").strip()
    if not poll_url:
        return None
    # Exemplu viitor: GET f"{poll_url}/{order_ref}" — lăsăm neimplementat fără spec
    return None
