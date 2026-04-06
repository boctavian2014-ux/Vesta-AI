"""
Notificări email — SMTP configurabil din env (fără dependență de main.py).
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


def send_report_ready_notification(
    user_email: str,
    adresa_imobil: Optional[str],
    nume_proprietar: Optional[str],
    ref_catastral: Optional[str] = None,
) -> None:
    adresa_afis = adresa_imobil or (f"Ref. cadastrală {ref_catastral}" if ref_catastral else "proprietate")
    proprietar_afis = nume_proprietar or "—"
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    mail_from = os.getenv("SMTP_FROM", user).strip() or user
    use_tls = os.getenv("SMTP_TLS", "true").lower() in ("1", "true", "yes")

    body = (
        f"Bună,\n\n"
        f"Raportul pentru {adresa_afis} este gata.\n"
        f"Proprietar (din surse disponibile): {proprietar_afis}\n\n"
        f"Deschide aplicația Vesta pentru detalii complete.\n"
    )

    if not host or not mail_from:
        print(
            f"📧 [MVP] Notificare către {user_email} – proprietate: {adresa_afis}, "
            f"proprietar: {proprietar_afis} (setează SMTP_HOST / SMTP_FROM pentru trimitere reală)"
        )
        return

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"Raport gata: {adresa_afis}"
    msg["From"] = mail_from
    msg["To"] = user_email

    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            if use_tls:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(mail_from, [user_email], msg.as_string())
        logger.info("Email trimis către %s", user_email)
    except Exception as exc:
        logger.exception("SMTP eșuat: %s", exc)
        print(f"📧 [fallback] Notificare către {user_email} – {adresa_afis} (SMTP eșuat: {exc})")
