"""
Test flux cap-coadă: identificare imobil -> DB -> ensure-guest -> create-checkout-session (fără Stripe real).
Rulează: pytest tests/test_flux.py -v (sau python -m pytest tests/test_flux.py -v)
"""
import os
import sys

# Fără Stripe keys ca să nu eșueze create-checkout-session din cauza config
os.environ.setdefault("STRIPE_SECRET_KEY", "")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_home():
    r = client.get("/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_identifica_imobil_madrid():
    """Click pe Madrid -> Catastro (sau cache) -> răspuns cu ref_cadastrală."""
    r = client.post(
        "/identifica-imobil/",
        json={"lat": 40.4167, "lon": -3.7033},
    )
    # 200 = succes (din cache sau Catastro); 422 = Catastro nu a găsit / eroare rețea
    assert r.status_code in (200, 422), r.json()
    if r.status_code == 200:
        data = r.json()
        assert "data" in data
        assert "ref_catastral" in data["data"]
        assert data["data"]["lat"] == 40.4167
        assert data["data"]["lon"] == -3.7033


def test_ensure_guest():
    """Guest email -> user_id."""
    r = client.post("/ensure-guest", json={"email": "test@example.com"})
    assert r.status_code == 200
    j = r.json()
    assert "user_id" in j
    assert j["email"] == "test@example.com"


def test_create_checkout_session_fails_without_stripe():
    """Fără STRIPE_SECRET_KEY, checkout returnează 503."""
    r = client.post(
        "/create-checkout-session",
        json={
            "property_id": 1,
            "user_id": 1,
            "success_url": "http://localhost:3000/success",
            "cancel_url": "http://localhost:3000/",
        },
    )
    assert r.status_code == 503
    assert "Stripe" in r.json().get("detail", "")
