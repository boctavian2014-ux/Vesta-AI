"""
Vesta – Retry & Notify Engine
==============================
Gestionează generarea asincronă a rapoartelor expert cu logică de retry și
notificare push (Expo) atunci când plata a reușit dar AI-ul a eșuat (timeout,
eroare OpenAI etc.).

Flux:
  1. Plată confirmată  → POST /report/generate-async  → returnează job_id
  2. Background task   → generate_expert_report() cu retry (max 2 reîncercări, delay exponențial)
  3. Succes            → job completat, push notification "Raportul tău e gata!"
  4. Eșec definitiv    → job marcat failed, push notification "Vom reîncerca în 5 min"
  5. Mobil             → GET /report/async-status/{job_id}  (polling până la completed/failed)

Stocare:
  - In-memory (dev/staging). În producție înlocuiți cu Redis (simplu swap al _job_store).
  - job_id = UUID hex generat la creare
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Job store in-memory ────────────────────────────────────────────────────────
# Schema entry:
#   {
#     "job_id": str,
#     "status": "queued" | "processing" | "completed" | "failed",
#     "attempt": int,          # 1-indexed
#     "max_retries": int,
#     "created_at": float,     # time.time()
#     "updated_at": float,
#     "result": dict | None,   # raportul complet la completare
#     "error": str | None,
#     "expo_push_token": str | None,
#     "request_data": dict,    # inputs trimise la generate_expert_report
#   }
_job_store: dict[str, dict] = {}
_store_lock = asyncio.Lock()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_PUSH_RETRIES = 2

# ── Expo Push Notification ─────────────────────────────────────────────────────

async def send_expo_push_notification(
    token: str,
    title: str,
    body: str,
    extra_data: dict | None = None,
    *,
    badge: int = 1,
) -> bool:
    """
    Trimite o notificare push prin Expo Push API.
    Returnează True dacă Expo a acceptat mesajul (nu garantează livrarea pe device).

    Args:
        token: Expo push token (ex: "ExponentPushToken[xxxxxx]")
        title: Titlul notificării
        body: Corpul mesajului
        extra_data: Date extra (ex: {"job_id": "...", "screen": "ExpertDashboard"})
        badge: Număr badge pe iconița aplicației
    """
    if not token or not token.startswith("Expo"):
        logger.warning("Token push invalid sau lipsă: %s", token)
        return False

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "badge": badge,
        "sound": "default",
        "data": extra_data or {},
        "channelId": "vesta-reports",  # Android notification channel
    }

    for attempt in range(1, MAX_PUSH_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=payload,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
            result = resp.json()
            data = result.get("data", {})
            status = data.get("status", "")
            if resp.status_code == 200 and status != "error":
                logger.info("Push notification trimisă (attempt %d): %s → %s", attempt, title, token[:20])
                return True
            logger.warning("Expo push eroare (attempt %d): %s", attempt, result)
        except Exception as exc:
            logger.error("Expo push exception (attempt %d): %s", attempt, exc)
        await asyncio.sleep(2 ** attempt)
    return False


# ── Job CRUD ───────────────────────────────────────────────────────────────────

async def create_job(
    request_data: dict,
    expo_push_token: str | None = None,
    max_retries: int = 2,
) -> str:
    """Creează un nou job și returnează job_id."""
    job_id = uuid.uuid4().hex
    now = time.time()
    async with _store_lock:
        _job_store[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "attempt": 0,
            "max_retries": max_retries,
            "created_at": now,
            "updated_at": now,
            "result": None,
            "error": None,
            "expo_push_token": expo_push_token,
            "request_data": request_data,
        }
    return job_id


async def get_job(job_id: str) -> dict | None:
    """Returnează starea unui job sau None dacă nu există."""
    async with _store_lock:
        entry = _job_store.get(job_id)
        return dict(entry) if entry else None


async def _update_job(job_id: str, **kwargs: Any) -> None:
    async with _store_lock:
        if job_id in _job_store:
            _job_store[job_id].update(kwargs)
            _job_store[job_id]["updated_at"] = time.time()


# ── Background task cu retry ───────────────────────────────────────────────────

async def run_report_job(job_id: str) -> None:
    """
    Rulează generarea raportului expert în background, cu retry exponențial.

    Strategia de retry:
      - attempt 1: imediat
      - attempt 2: delay 30s (dă timp AI-ului să se recupereze)
      - attempt 3: delay 90s
      - după max_retries eșuate: job marcat failed + push notification

    Izolat în asyncio.to_thread() pentru că generate_expert_report este blocking (OpenAI sync SDK).
    """
    job = await get_job(job_id)
    if not job:
        logger.error("Job %s negăsit în store.", job_id)
        return

    max_retries = job["max_retries"]
    request_data = job["request_data"]
    expo_token = job["expo_push_token"]
    language = request_data.get("language", "en")

    # Importăm local pentru a evita circular imports la nivel de modul
    from expert_report import generate_expert_report

    for attempt in range(1, max_retries + 2):  # +1 pentru tentativa inițială
        await _update_job(job_id, status="processing", attempt=attempt)
        logger.info("Job %s – attempt %d/%d", job_id, attempt, max_retries + 1)

        try:
            # Rulăm funcția blocking într-un thread separat (nu blochează event loop-ul)
            result = await asyncio.to_thread(
                generate_expert_report,
                request_data.get("inputs", {}),
                language,
            )

            # Verificare minimă calitate: dacă AI a returnat un raport default cu eroare
            if result.get("error") and not result.get("risk"):
                raise ValueError(f"AI returned error: {result['error']}")

            # Succes
            await _update_job(job_id, status="completed", result=result, error=None)
            logger.info("Job %s completat cu succes (attempt %d).", job_id, attempt)

            # Push notification: raportul e gata
            if expo_token:
                address = (result.get("property") or {}).get("address", "proprietatea ta")
                await send_expo_push_notification(
                    expo_token,
                    title="✅ Raportul tău Vesta este gata!",
                    body=f"Analiza premium pentru {address} a fost finalizată. Deschide aplicația pentru a vedea rezultatele.",
                    extra_data={"job_id": job_id, "screen": "ExpertDashboard", "status": "completed"},
                )
            return

        except Exception as exc:
            error_msg = str(exc)
            logger.warning("Job %s – attempt %d eșuat: %s", job_id, attempt, error_msg)
            await _update_job(job_id, error=error_msg)

            if attempt <= max_retries:
                # Delay exponențial: 30s, 90s
                delay = 30 * (3 ** (attempt - 1))
                logger.info("Job %s – retry în %ds.", job_id, delay)

                # Notificare intermediară (o singură dată, la prima reîncercare)
                if attempt == 1 and expo_token:
                    await send_expo_push_notification(
                        expo_token,
                        title="⏳ Analiza ta durează puțin mai mult...",
                        body="Serverul nostru AI este solicitat. Te vom anunța imediat ce raportul de 49€ este gata.",
                        extra_data={"job_id": job_id, "screen": "ExpertDashboard", "status": "retrying"},
                        badge=0,
                    )

                await asyncio.sleep(delay)
            else:
                # Eșec definitiv după toate reîncercările
                await _update_job(job_id, status="failed")
                logger.error("Job %s – eșec definitiv după %d încercări.", job_id, attempt)

                if expo_token:
                    await send_expo_push_notification(
                        expo_token,
                        title="❌ Eroare la generarea raportului",
                        body="Ne cerem scuze – a apărut o eroare tehnică. Suma de 49€ va fi rambursată automat în 3-5 zile lucrătoare.",
                        extra_data={"job_id": job_id, "status": "failed", "screen": "Support"},
                    )


def get_public_job_status(job: dict) -> dict:
    """
    Returnează o versiune publică a jobului (fără date interne sensibile).
    Folosit de endpoint-ul GET /report/async-status/{job_id}.
    """
    result = job.get("result")
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "attempt": job["attempt"],
        "max_retries": job["max_retries"],
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "error": job.get("error") if job["status"] == "failed" else None,
        # Raportul complet e disponibil doar la completare
        "report": result if job["status"] == "completed" else None,
        # Estimare timp rămas (pentru UX)
        "elapsed_seconds": round(time.time() - job["created_at"]),
    }
