"""Rulează: python run_flux_test.py. Scrie rezultatul în flux_test_result.txt."""
import os
import sys

os.environ.setdefault("STRIPE_SECRET_KEY", "")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "")

out = []
try:
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)

    r = client.get("/")
    out.append(f"GET /: {r.status_code} {r.json()}")

    r2 = client.post("/ensure-guest", json={"email": "test@example.com"})
    out.append(f"POST /ensure-guest: {r2.status_code} {r2.json()}")

    user_id = r2.json().get("user_id", 1)
    r3 = client.post(
        "/create-checkout-session",
        json={"property_id": 1, "user_id": user_id, "success_url": "http://x", "cancel_url": "http://x"},
    )
    out.append(f"POST /create-checkout-session: {r3.status_code} {r3.json()}")

    out.append("OK: DB + Guest + Checkout endpoint funcționale.")
except Exception as e:
    out.append(f"EROARE: {e}")
    sys.exit(1)

result = "\n".join(out)
with open("flux_test_result.txt", "w", encoding="utf-8") as f:
    f.write(result)
print(result)
