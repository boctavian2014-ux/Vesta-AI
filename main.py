import base64
import os
import shutil
import uuid
import xml.etree.ElementTree as ET
import urllib3
from email.mime.text import MIMEText
from typing import Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import certifi
import requests
import smtplib
import stripe
from fastapi import Depends, File, FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

import zeep  # pentru căutare după adresă (ConsultaNumero) - de folosit ulterior
from openai import OpenAI

# Cale absolută (Railway: __file__ e în container)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CATASTRO_CERT_PATH = os.path.join(BASE_DIR, "fnmt_root.pem")


def setup_ssl_bundle():
    """Creează vesta_bundle.pem (Standard + FNMT) în folderul app-ului și setează env. Evită PermissionError."""
    combined_bundle = os.path.join(BASE_DIR, "vesta_bundle.pem")
    fnmt_cert_path = os.path.join(BASE_DIR, "fnmt_root.pem")
    original_bundle = certifi.where()
    try:
        with open(combined_bundle, "wb") as outfile:
            with open(original_bundle, "rb") as infile:
                shutil.copyfileobj(infile, outfile)
            if os.path.exists(fnmt_cert_path):
                with open(fnmt_cert_path, "rb") as infile:
                    outfile.write(b"\n")
                    shutil.copyfileobj(infile, outfile)
                print("✅ Bundle SSL creat cu succes (Standard + FNMT).")
            else:
                print("⚠️ Atenție: fnmt_root.pem nu a fost găsit!")
        os.environ["REQUESTS_CA_BUNDLE"] = combined_bundle
        os.environ["SSL_CERT_FILE"] = combined_bundle
    except Exception as e:
        print(f"❌ Eroare la configurarea bundle-ului SSL: {e}")


setup_ssl_bundle()

# Serviciu oficial documentat: ovc.catastro.meh.es (GET Consulta_RCCOOR)
CATASTRO_URL = "https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc/ovccoordenadas.asmx/Consulta_RCCOOR"

from database import DetailedReport, Property, SessionLocal, User
from red_flags import calculeaza_scor_oportunitate
from vision_abandon import analizeaza_stare_piscina, fetch_google_static_satellite
from carta_oferta import genera_carta_oferta

# Fallback identificare: când Catastro (coordonate) eșuează, folosim adresa poștală + ConsultaNumero
try:
    from cauta_imobil_spania import cauta_imobil_spania
except ImportError:
    cauta_imobil_spania = None

from ocr_nota_simple import extrage_nota_simple
from pdf_generator import exporta_scrisoare_pdf

# --- Stripe (setează în .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) ---
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")  # pentru imagini satelit (analiză piscină)
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "")   # pentru analiza AI (satelit Mapbox)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PRET_RAPORT_EUR = 19  # 19€ per Nota Simple

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI(title="OpenHouse Spain API")

# CORS: setează CORS_ORIGINS pentru producție (ex. https://openhouse.vercel.app). Pentru dev + app mobil lasă nesetat (= permitem orice origin).
_cors_origins_raw = os.getenv("CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if not _cors_origins:
    _cors_origins = ["*"]
_allow_credentials = bool(_cors_origins_raw)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Foldere pentru upload temporar și scrisori PDF
TEMP_UPLOADS_DIR = os.path.join(BASE_DIR, "temp_uploads")
STATIC_LETTERS_DIR = os.path.join(BASE_DIR, "static", "letters")
for _dir in (TEMP_UPLOADS_DIR, STATIC_LETTERS_DIR):
    os.makedirs(_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Asigură că orice eroare neprinsă returnează JSON (nu HTML/text), ca app-ul mobil să nu primească XML sau „Unexpected character”."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Eroare internă server", "error": str(exc)},
    )


# Verificare SSL la pornire (certifi + FNMT injectat)
try:
    r = requests.get(
        CATASTRO_URL,
        params={"SRS": "EPSG:4326", "Coordenada_X": -3.70, "Coordenada_Y": 40.42},
        timeout=10,
        verify=False,
    )
    r.raise_for_status()
    print("Succes SSL Catastro")
except Exception as e:
    print(f"Eroare verificare SSL Catastro: {e}")

# Model pentru cererea de la user (coordonate de pe hartă)
class ClickLocation(BaseModel):
    lat: float
    lon: float


# Model pentru crearea sesiunii de plată Stripe
class CheckoutRequest(BaseModel):
    property_id: int
    user_id: int
    success_url: str = "https://platforma-ta.ro/success"
    cancel_url: str = "https://platforma-ta.ro/cancel"


# Guest: obține sau creează user după email (fără cont obligatoriu)
class GuestEmail(BaseModel):
    email: str


# Body pentru PaymentIntent (Payment Sheet) – metadata pentru webhook
class CreeazaPlataRequest(BaseModel):
    email: Optional[str] = None
    property_id: Optional[int] = None
    tip: Optional[str] = "standard"  # "standard" 19€ | "premium" 50€


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def trimite_email_notificare(
    user_email: str,
    adresa_imobil: Optional[str],
    nume_proprietar: Optional[str],
    ref_catastral: Optional[str] = None,
):
    """Trimite notificare când raportul este finalizat. MVP: log; producție: SMTP/SendGrid."""
    adresa_afis = adresa_imobil or (f"Ref. cadastrală {ref_catastral}" if ref_catastral else "proprietate")
    proprietar_afis = nume_proprietar or "Nu s-a putut extrage"

    # Producție: deblochează și configurează SMTP (Gmail, SendGrid, etc.)
    # msg = MIMEText(corp)
    # msg["Subject"] = f"✅ Raport Finalizat: {adresa_afis}"
    # msg["From"] = "notificari@platforma-ta.ro"
    # msg["To"] = user_email
    # with smtplib.SMTP("smtp.gmail.com", 587) as server: ...
    print(
        f"📧 [MVP] Notificare către {user_email} – proprietate: {adresa_afis}, "
        f"proprietar: {proprietar_afis}"
    )


def solicita_raport_registru(
    db: Session,
    report_id: int,
    property_id: int,
    external_request_id: str,
    ref_catastral: str,
):
    """
    Declanșează cererea la API-ul intermediar (Registru / Nota Simple).
    API-ul va apela înapoi POST /webhook/registru-update când PDF-ul e gata.
    """
    # TODO: apel real către API-ul intermediar, ex.:
    # requests.post("https://api-registru.example.com/solicitar", json={
    #     "request_id": external_request_id,
    #     "ref_catastral": ref_catastral,
    #     "callback_url": "https://api-ta.ro/webhook/registru-update",
    # })
    print(
        f"📄 [MVP] Cerere Registru – report_id={report_id}, property_id={property_id}, "
        f"request_id={external_request_id}, ref={ref_catastral}"
    )


def _score_for_property(prop: Property) -> int:
    """Scor 0–100 din datele disponibile (year_built, stare_piscina, nota_simple)."""
    date_satelit = None
    if getattr(prop, "stare_piscina", None) == "CRITIC":
        date_satelit = {"stare_piscina": "CRITIC"}
    return calculeaza_scor_oportunitate(
        {"year_built": getattr(prop, "year_built", None)},
        None,
        date_satelit,
    )


def property_to_dict(prop: Property):
    """Serializare Property pentru răspuns JSON. Includem scor_oportunitate pentru harta."""
    scor = getattr(prop, "scor_oportunitate", None)
    if scor is None:
        scor = _score_for_property(prop)
    return {
        "id": prop.id,
        "ref_catastral": prop.ref_catastral,
        "address": prop.address,
        "lat": prop.lat,
        "lon": prop.lon,
        "year_built": prop.year_built,
        "sq_meters": prop.sq_meters,
        "scor_oportunitate": scor,
        "stare_piscina": getattr(prop, "stare_piscina", None),
        "last_updated": prop.last_updated.isoformat() if prop.last_updated else None,
    }


@app.get("/")
def home():
    return {"message": "Serverul imobiliar este activ!"}


@app.get("/proprietati")
def list_proprietati(
    scor_min: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Lista proprietăți pentru hartă (markere). PRO: filtrează după scor_min (ex: doar roșii >= 50).
    """
    q = db.query(Property)
    if scor_min is not None:
        q = q.filter(Property.scor_oportunitate >= scor_min)
    props = q.all()
    return {
        "proprietati": [
            {
                "id": p.id,
                "lat": p.lat,
                "lon": p.lon,
                "ref_catastral": p.ref_catastral,
                "scor_oportunitate": getattr(p, "scor_oportunitate", None) or _score_for_property(p),
                "stare_piscina": getattr(p, "stare_piscina", None),
            }
            for p in props
        ]
    }


@app.post("/analizeaza-satelit/{property_id}")
async def analizeaza_satelit_property(property_id: int, db: Session = Depends(get_db)):
    """
    Preia imagine satelit la coordonatele proprietății, rulează analiza „piscină mlaștină”
    (OpenCV), actualizează stare_piscina și scor_oportunitate.
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_MAPS_API_KEY lipsește pentru imagini satelit.",
        )
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Proprietate negăsită")

    img_bytes = fetch_google_static_satellite(
        prop.lat, prop.lon, GOOGLE_MAPS_API_KEY, zoom=20, width=400, height=400
    )
    if not img_bytes:
        raise HTTPException(status_code=502, detail="Nu s-a putut descărca imaginea satelit.")

    try:
        rezultat = analizeaza_stare_piscina(img_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare analiză: {e}")

    prop.stare_piscina = rezultat["status"]
    prop.scor_oportunitate = calculeaza_scor_oportunitate(
        {"year_built": prop.year_built},
        None,
        {"stare_piscina": rezultat["status"]},
    )
    db.commit()
    db.refresh(prop)

    return {
        "property_id": property_id,
        "stare_piscina": rezultat["status"],
        "procent_verde": rezultat["procent_verde"],
        "mesaj": rezultat["mesaj"],
        "scor_oportunitate_nou": prop.scor_oportunitate,
    }


# Toleranță pentru „aceeași” locație (aprox. ~10 m la ecuator)
COORD_TOLERANCE = 0.0001

# Fallback: adresă poștală din Nominatim (gratuit) pentru când Catastro pe coordonate eșuează
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"


def _reverse_geocode_nominatim(lat: float, lon: float) -> Optional[dict]:
    """
    Reverse geocode (lat, lon) -> adresă. Returnează dict cu provincie, municipiu, strada, numar
    (pentru cauta_imobil_spania) sau None dacă nu s-a putut obține o adresă în Spania.
    """
    try:
        r = requests.get(
            NOMINATIM_URL,
            params={"lat": lat, "lon": lon, "format": "json", "addressdetails": 1},
            headers={"User-Agent": "VestaOpenHouse/1.0"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        addr = data.get("address") or {}
        country = (addr.get("country_code") or "").upper()
        if country != "ES":
            return None
        # Provincia: state poate fi "Community of Madrid" -> MADRID, sau "Málaga" -> MALAGA
        state = (addr.get("state") or addr.get("region") or "").strip()
        if not state:
            state = addr.get("city") or addr.get("town") or addr.get("village") or ""
        provincie = state.upper().replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
        # Ultimul cuvânt e often numele provinciei (e.g. "Community of Madrid" -> MADRID)
        if " " in provincie:
            provincie = provincie.split()[-1]
        # Municipio
        municipiu = (addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or state or "").strip().upper()
        municipiu = municipiu.replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
        if " " in municipiu:
            municipiu = municipiu.split()[-1] if municipiu else ""
        # Strada și număr
        strada = (addr.get("road") or addr.get("pedestrian") or addr.get("street") or "").strip().upper()
        numar = (addr.get("house_number") or addr.get("house_name") or "S/N").strip().upper()
        if not strada and not municipiu:
            return None
        if not strada:
            strada = "CALLE"
        return {"provincie": provincie or "MADRID", "municipiu": municipiu or "MADRID", "strada": strada, "numar": numar}
    except Exception as e:
        print(f"⚠️ Nominatim reverse geocode failed: {e}")
        return None


def _identifica_imobil_fallback_adresa(lat: float, lon: float) -> Optional[dict]:
    """
    Dacă Catastro pe coordonate eșuează: obține adresa din Nominatim și caută referința
    cadastrală prin ConsultaNumero (cauta_imobil_spania). Returnează același format ca
    get_catastro_data: {"status": "success", "data": {"ref_catastral": ..., "address": ...}}
    sau None.
    """
    if not cauta_imobil_spania:
        return None
    addr = _reverse_geocode_nominatim(lat, lon)
    if not addr:
        return None
    ref = cauta_imobil_spania(
        addr["provincie"],
        addr["municipiu"],
        addr["strada"],
        addr["numar"],
    )
    if not ref or not ref.strip():
        return None
    # Adresă afiș pentru utilizator (reconstruită)
    address_display = f"{addr['strada']} {addr['numar']}, {addr['municipiu']}"
    return {"status": "success", "data": {"ref_catastral": ref.strip(), "address": address_display}}


def obtine_analiza_oportunitate(lat: float, lon: float) -> Optional[str]:
    """
    Analiză AI (GPT-4o + imagine Mapbox satelit) pentru investitor: piscină, curte, panouri solare,
    scor oportunitate renovare 1–10. Returnează textul sau None dacă lipsesc chei/eroare.
    Imaginea Mapbox este descărcată pe backend și trimisă ca base64 către OpenAI (evită invalid_image_url).
    """
    if not OPENAI_API_KEY or not MAPBOX_ACCESS_TOKEN:
        return None
    image_url = (
        f"https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/{lon},{lat},18,0/600x600"
        f"?access_token={MAPBOX_ACCESS_TOKEN}"
    )
    try:
        # Descărcăm imaginea pe server; OpenAI nu poate accesa direct URL-ul Mapbox (invalid_image_url)
        img_resp = requests.get(image_url, timeout=15)
        img_resp.raise_for_status()
        img_bytes = img_resp.content
        img_b64 = base64.standard_b64encode(img_bytes).decode("ascii")
        data_url = f"data:image/jpeg;base64,{img_b64}"

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Analizează această proprietate din Spania pentru un investitor imobiliar. "
                                "1. Identifică dacă există o piscină. Dacă da, este apa curată (albastră) sau murdară/abandonată (verde/maro)? "
                                "2. Starea curții: este îngrijită sau plină de vegetație uscată/buruieni? "
                                "3. Există panouri solare? "
                                "4. Dă un scor de 'Oportunitate de Renovare' de la 1 la 10 (unde 10 înseamnă casă clar abandonată cu potențial mare)."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            max_tokens=500,
        )
        return response.choices[0].message.content or None
    except requests.RequestException as e:
        return f"Eroare la descărcarea imaginii satelit: {str(e)}"
    except Exception as e:
        return f"Eroare AI: {str(e)}"


def get_catastro_data(lat: float, lon: float):
    """
    Apelează Catastro pe domeniul oficial meh.es (documentație Sede Electrónica).
    GET Consulta_RCCOOR: SRS, Coordenada_X (lon), Coordenada_Y (lat). Headers iPhone + es-ES.
    """
    params = {
        "SRS": "EPSG:4326",
        "Coordenada_X": f"{lon:.8f}",   # Longitudinea (X)
        "Coordenada_Y": f"{lat:.8f}",   # Latitudinea (Y)
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
    }

    try:
        response = requests.get(
            CATASTRO_URL,
            params=params,
            headers=headers,
            verify=False,
            timeout=10,
        )
        print(f"📡 Status final: {response.status_code}")
        print(f"📡 URL apelat: {response.url}")
    except Exception as e:
        print(f"❌ Eroare apel: {e}")
        return {"status": "error", "message": f"Eroare rețea: {str(e)}"}

    if response.status_code != 200:
        return {"status": "error", "message": f"Catastro a returnat {response.status_code}"}

    try:
        root = ET.fromstring(response.content)
        ns = {"cat": "http://www.catastro.minhap.es/"}

        pc1 = root.find(".//cat:pc1", ns)
        pc2 = root.find(".//cat:pc2", ns)
        if pc1 is None or pc2 is None:
            pc1 = root.find(".//{http://www.catastro.meh.es/}pc1")
            pc2 = root.find(".//{http://www.catastro.meh.es/}pc2")
        if pc1 is not None and pc2 is not None and (pc1.text or pc2.text):
            referinta = (pc1.text or "") + (pc2.text or "")
            referinta = referinta.strip()
            if referinta:
                return {
                    "status": "success",
                    "data": {
                        "ref_catastral": referinta,
                        "address": None,
                    },
                }

        des_error = root.find(".//cat:des", ns) or root.find(".//{http://www.catastro.meh.es/}des")
        error_msg = (des_error.text or "").strip() if des_error is not None else "Locație fără referință"
        if not error_msg:
            error_msg = "Locație fără referință"
        return {"status": "error", "message": error_msg}
    except ET.ParseError as e:
        return {"status": "error", "message": "Eroare parsare XML"}
    except Exception as e:
        return {"status": "error", "message": "Eroare internă server la procesare"}


@app.post("/identifica-imobil/")
async def identifica_imobil(location: ClickLocation, db: Session = Depends(get_db)):
    # 1. Cache: avem deja imobilul la aceste coordonate?
    existing_prop = (
        db.query(Property)
        .filter(
            Property.lat.between(location.lat - COORD_TOLERANCE, location.lat + COORD_TOLERANCE),
            Property.lon.between(location.lon - COORD_TOLERANCE, location.lon + COORD_TOLERANCE),
        )
        .first()
    )

    if existing_prop:
        analiza_ai = obtine_analiza_oportunitate(location.lat, location.lon)
        data = property_to_dict(existing_prop)
        return {
            "source": "baza_de_date",
            "status": "succes",
            "referinta": existing_prop.ref_catastral,
            "referinta_cadastrala": existing_prop.ref_catastral,
            "data": data,
            "analiza_ai": analiza_ai,
            "scor": data.get("scor_oportunitate"),
        }

    # 2. Apelăm Catastro (coordonate -> referință cadastrală)
    try:
        result = get_catastro_data(location.lat, location.lon)
    except Exception as e:
        result = {"status": "error", "message": str(e)}

    # Fallback: dacă coordonate_la_referinta/Catastro eșuează, preluăm adresa din Nominatim și apelăm cauta_imobil_spania
    if result["status"] == "error":
        fallback = _identifica_imobil_fallback_adresa(location.lat, location.lon)
        if fallback and fallback.get("status") == "success":
            result = fallback
        else:
            raise HTTPException(status_code=422, detail=result.get("message", "Catastro: eroare"))

    referinta_cadastrala = result["data"]["ref_catastral"]

    # 3. Salvăm în baza de date (evităm duplicate după ref_catastral)
    existing_by_ref = db.query(Property).filter(Property.ref_catastral == referinta_cadastrala).first()
    if existing_by_ref:
        analiza_ai = obtine_analiza_oportunitate(location.lat, location.lon)
        data = property_to_dict(existing_by_ref)
        return {
            "source": "baza_de_date",
            "status": "succes",
            "referinta": referinta_cadastrala,
            "referinta_cadastrala": referinta_cadastrala,
            "data": data,
            "analiza_ai": analiza_ai,
            "scor": data.get("scor_oportunitate"),
        }

    scor_initial = calculeaza_scor_oportunitate({"year_built": None}, None)
    noua_proprietate = Property(
        ref_catastral=referinta_cadastrala,
        lat=location.lat,
        lon=location.lon,
        address=result["data"].get("address"),
        year_built=None,
        sq_meters=None,
        scor_oportunitate=scor_initial,
    )
    db.add(noua_proprietate)
    db.commit()
    db.refresh(noua_proprietate)

    analiza_ai = obtine_analiza_oportunitate(location.lat, location.lon)
    data = property_to_dict(noua_proprietate)
    return {
        "source": "catastro_api",
        "status": "succes",
        "referinta": referinta_cadastrala,
        "referinta_cadastrala": referinta_cadastrala,
        "data": data,
        "analiza_ai": analiza_ai,
        "scor": data.get("scor_oportunitate"),
    }


# --- Guest (fără cont obligatoriu): email → user_id pentru Stripe ---

@app.post("/ensure-guest")
async def ensure_guest(body: GuestEmail, db: Session = Depends(get_db)):
    """Creează sau returnează un user după email. Folosit înainte de checkout ca guest."""
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email obligatoriu")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"user_id": user.id, "email": user.email}


# --- Stripe: Checkout 19€ → metadata (property_id, user_id) ---

@app.post("/create-checkout-session")
async def create_checkout_session(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
):
    """Creează sesiune Stripe Checkout 19€; metadata leagă plata de proprietate și user."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Stripe nu este configurat (STRIPE_SECRET_KEY lipsește).",
        )
    prop = db.query(Property).filter(Property.id == body.property_id).first()
    user = db.query(User).filter(User.id == body.user_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Proprietate negăsită")
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Utilizator negăsit sau inactiv")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {
                            "name": "Raport Nota Simple",
                            "description": f"Proprietate: {prop.address or prop.ref_catastral}",
                            "metadata": {"property_id": str(prop.id)},
                        },
                        "unit_amount": PRET_RAPORT_EUR * 100,  # 19€ în centi
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=body.success_url,
            cancel_url=body.cancel_url,
            metadata={
                "property_id": str(body.property_id),
                "user_id": str(body.user_id),
            },
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/creeaza-plata/")
async def creeaza_plata(request: Request):
    """Creează un PaymentIntent Stripe: 19€ (standard) sau 50€ (premium); tip + email + property_id în metadata."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Stripe nu este configurat (STRIPE_SECRET_KEY lipsește).",
        )
    try:
        data = await request.json()
    except Exception:
        data = {}
    if data is None:
        data = {}

    tip = data.get("tip", "standard")
    suma = 5000 if tip == "premium" else 1900
    email = data.get("email", "necunoscut@email.com")
    ref = data.get("property_id", "fara_ref")

    try:
        intent = stripe.PaymentIntent.create(
            amount=suma,
            currency="eur",
            automatic_payment_methods={"enabled": True},
            metadata={
                "tip_raport": tip,
                "email": str(email).strip().lower(),
                "property_id": str(ref),
            },
        )
        return {"clientSecret": intent.client_secret}
    except Exception as e:
        print(f"Eroare Stripe: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.post("/stripe-webhook/")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Ascultă când Stripe confirmă plata (PaymentIntent – Payment Sheet).
    Din metadata (email, property_id) creează raport și declanșează cererea la Registru.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not endpoint_secret:
        return JSONResponse(status_code=503, content={"error": "STRIPE_WEBHOOK_SECRET lipsește"})

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

    if event["type"] == "payment_intent.succeeded":
        payment_intent = event["data"]["object"]
        amount = payment_intent.get("amount", 0) / 100
        print(f"💰 Plată confirmată pentru: {amount} EUR")
        meta = payment_intent.get("metadata") or {}
        email = (meta.get("email") or "").strip().lower()
        try:
            property_id = int(meta.get("property_id", 0))
        except (TypeError, ValueError):
            property_id = 0

        if email and property_id:
            # Idempotență: evităm duplicate la retrimitere Stripe
            pi_id = payment_intent.get("id", "")
            existing = (
                db.query(DetailedReport)
                .filter(DetailedReport.stripe_session_id == pi_id)
                .first()
            )
            if existing:
                return JSONResponse(content={"status": "success", "report_id": existing.id, "duplicate": True})

            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(email=email, is_active=True)
                db.add(user)
                db.commit()
                db.refresh(user)
            prop = db.query(Property).filter(Property.id == property_id).first()
            if not prop:
                return JSONResponse(content={"error": "Proprietate negăsită"}, status_code=404)
            external_request_id = f"req_{uuid.uuid4().hex[:16]}"
            report = DetailedReport(
                property_id=property_id,
                user_id=user.id,
                status="processing",
                external_request_id=external_request_id,
                stripe_session_id=pi_id,
            )
            db.add(report)
            db.commit()
            db.refresh(report)
            solicita_raport_registru(db, report.id, property_id, external_request_id, prop.ref_catastral)
            print(f"📄 Raport creat: report_id={report.id}, request_id={external_request_id}")
        elif email:
            print(f"📧 Plată de la {email} (fără property_id în metadata – nu se creează raport)")

    return JSONResponse(content={"status": "success"})


@app.post("/webhook/stripe")
async def webhook_stripe(request: Request, db: Session = Depends(get_db)):
    """
    Apelat de Stripe când plata este finalizată.
    Creează DetailedReport, generează request_id, declanșează cererea la Registru.
    """
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET lipsește")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload invalid")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Semnal Stripe invalid")

    if event["type"] != "checkout.session.completed":
        return JSONResponse(content={"received": True})

    session = event["data"]["object"]
    session_id = session.get("id")  # cs_test_... sau cs_live_...

    # Idempotență: Stripe poate retrimite același eveniment; procesăm o singură dată
    existing = (
        db.query(DetailedReport)
        .filter(DetailedReport.stripe_session_id == session_id)
        .first()
    )
    if existing:
        return JSONResponse(content={"received": True, "report_id": existing.id, "duplicate": True})

    metadata = session.get("metadata") or {}
    property_id = int(metadata.get("property_id", 0))
    user_id = int(metadata.get("user_id", 0))
    if not property_id or not user_id:
        return JSONResponse(
            content={"error": "metadata incomplet"},
            status_code=400,
        )

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        return JSONResponse(
            content={"error": "Proprietate negăsită"},
            status_code=404,
        )

    external_request_id = f"req_{uuid.uuid4().hex[:16]}"
    report = DetailedReport(
        property_id=property_id,
        user_id=user_id,
        status="processing",
        external_request_id=external_request_id,
        stripe_session_id=session_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    solicita_raport_registru(
        db, report.id, property_id, external_request_id, prop.ref_catastral
    )

    return JSONResponse(content={"received": True, "report_id": report.id})


@app.get("/raport/{report_id}/carta-oferta")
async def get_carta_oferta(report_id: int, db: Session = Depends(get_db)):
    """
    Generează scrisoarea de ofertă (propuesta de adquisición) pe baza raportului completed.
    Returnează subiect + corp în spaniolă, gata de trimis prin poștă sau email.
    """
    report = db.query(DetailedReport).filter(DetailedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Raport negăsit")
    if report.status != "completed":
        raise HTTPException(
            status_code=422,
            detail="Raportul trebuie să fie completed pentru a genera carta de oferta.",
        )
    prop = db.query(Property).filter(Property.id == report.property_id).first()
    direccion = "Málaga"
    if prop:
        direccion = prop.address or f"Ref. cadastral {prop.ref_catastral}"
    cargas = getattr(report, "cargas_resumen", None)
    asunto, cuerpo = genera_carta_oferta(
        report.extracted_owner or "Propietario/a",
        direccion,
        cargas,
    )
    return {
        "report_id": report_id,
        "asunto": asunto,
        "cuerpo": cuerpo,
        "texto_completo": f"Asunto: {asunto}\n\n{cuerpo}",
    }


@app.post("/proceseaza-nota-simple/")
async def proceseaza_nota_simple(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    report_id: Optional[int] = Form(None),
):
    """
    Primește un fișier (PDF sau imagine) Nota Simple, extrage cu AI (GPT-4o Vision):
    Titular, Descripción, Cargas, Dirección. Salvează în detailed_reports dacă report_id e dat.
    Apelează genera_carta_oferta și returnează atât datele extrase cât și scrisoarea de ofertă.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fișier gol")
    extracted = extrage_nota_simple(content, file.filename or "")
    if extracted.get("error"):
        raise HTTPException(status_code=422, detail=extracted["error"])

    titular = extracted.get("titular", "")
    cargas_resumen = extracted.get("cargas", "")
    direccion = extracted.get("direccion", "") or "Málaga"

    # Actualizare raport dacă report_id este furnizat
    if report_id is not None:
        report = db.query(DetailedReport).filter(DetailedReport.id == report_id).first()
        if report:
            report.extracted_owner = titular or report.extracted_owner
            report.cargas_resumen = cargas_resumen or report.cargas_resumen
            report.status = "completed"
            db.commit()
            # Dirección pentru scrisoare: din proprietate dacă există, altfel din OCR
            prop = db.query(Property).filter(Property.id == report.property_id).first()
            if prop and (prop.address or prop.ref_catastral):
                direccion = prop.address or f"Ref. cadastral {prop.ref_catastral}"

    asunto, cuerpo = genera_carta_oferta(titular or "Propietario/a", direccion, cargas_resumen)

    return {
        "extracted": {
            "titular": titular,
            "descripcion": extracted.get("descripcion", ""),
            "cargas": cargas_resumen,
            "direccion": direccion,
        },
        "report_id": report_id,
        "asunto": asunto,
        "cuerpo": cuerpo,
        "texto_completo": f"Asunto: {asunto}\n\n{cuerpo}",
        "manual_check": extracted.get("manual_check", False),
    }


@app.post("/api/reports/{report_id}/upload-nota-simple")
async def upload_nota_simple(
    report_id: int,
    request: Request,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    """
    Upload Nota Simple pentru un raport: OCR -> genera_carta_oferta -> exporta_scrisoare_pdf.
    Salvează PDF-ul în static/letters/, actualizează pdf_url în detailed_reports.
    Returnează datele extrase, scrisoarea și download_url către PDF.
    """
    report = db.query(DetailedReport).filter(DetailedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Raport negăsit")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fișier gol")

    # Salvare temporară opțională (pentru debug / audit)
    temp_path = None
    try:
        temp_path = os.path.join(TEMP_UPLOADS_DIR, f"nota_{report_id}_{uuid.uuid4().hex[:8]}_{(file.filename or 'doc')[-50:]}")
        with open(temp_path, "wb") as f:
            f.write(content)
    except Exception:
        pass  # continuăm fără temp

    extracted = extrage_nota_simple(content, file.filename or "")
    if extracted.get("error"):
        if temp_path and os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise HTTPException(status_code=422, detail=extracted["error"])

    titular = extracted.get("titular", "") or (report.extracted_owner or "")
    cargas_resumen = extracted.get("cargas", "") or (report.cargas_resumen or "")
    direccion = extracted.get("direccion", "") or "Málaga"

    prop = db.query(Property).filter(Property.id == report.property_id).first()
    if prop and (prop.address or prop.ref_catastral):
        direccion = prop.address or f"Ref. cadastral {prop.ref_catastral}"

    asunto, cuerpo = genera_carta_oferta(titular or "Propietario/a", direccion, cargas_resumen)

    filename_pdf = f"scrisoare_{report_id}_{uuid.uuid4().hex[:12]}.pdf"
    output_path = os.path.join(STATIC_LETTERS_DIR, filename_pdf)
    try:
        exporta_scrisoare_pdf(titular or "Propietario/a", direccion, cuerpo, output_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare generare PDF: {e}")

    report.extracted_owner = titular or report.extracted_owner
    report.cargas_resumen = cargas_resumen or report.cargas_resumen
    report.status = "completed"
    report.pdf_url = f"/static/letters/{filename_pdf}"
    db.commit()

    base_url = str(request.base_url).rstrip("/")
    download_url = f"{base_url}/static/letters/{filename_pdf}"

    return {
        "extracted": {
            "titular": titular,
            "descripcion": extracted.get("descripcion", ""),
            "cargas": cargas_resumen,
            "direccion": direccion,
        },
        "report_id": report_id,
        "asunto": asunto,
        "cuerpo": cuerpo,
        "texto_completo": f"Asunto: {asunto}\n\n{cuerpo}",
        "download_url": download_url,
        "pdf_url": report.pdf_url,
        "manual_check": extracted.get("manual_check", False),
    }


@app.get("/request-id-by-session/{session_id}")
async def request_id_by_session(session_id: str, db: Session = Depends(get_db)):
    """
    Returnează external_request_id pentru o sesiune Stripe Checkout.
    Folosit de app mobil după redirect success pentru a afișa request_id fără tastare.
    """
    report = (
        db.query(DetailedReport)
        .filter(DetailedReport.stripe_session_id == session_id)
        .first()
    )
    if not report:
        return {"request_id": None, "status": "pending"}
    return {"request_id": report.external_request_id, "status": report.status}


@app.get("/status-raport/{request_id}")
async def verifica_raport(request_id: str, db: Session = Depends(get_db)):
    """Verifică statusul raportului (pending / processing / completed / failed)."""
    report = (
        db.query(DetailedReport)
        .filter(DetailedReport.external_request_id == request_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Raport negăsit")
    result = {
        "request_id": request_id,
        "status": report.status,
        "pdf_url": report.pdf_url,
        "extracted_owner": report.extracted_owner,
    }
    result["report_id"] = report.id
    return result


@app.post("/webhook/registru-update")
async def webhook_registru(data: dict, db: Session = Depends(get_db)):
    """
    Apelat de API-ul intermediar (Registru / Nota Simple) când PDF-ul este gata.
    Actualizează raportul și trimite notificarea utilizatorului.
    """
    external_id = data.get("request_id")
    if not external_id:
        raise HTTPException(status_code=400, detail="Lipsește request_id")

    report = (
        db.query(DetailedReport)
        .filter(DetailedReport.external_request_id == external_id)
        .first()
    )

    if not report:
        return {"error": "Raport negăsit", "request_id": external_id}

    # Actualizăm datele cu ce a trimis API-ul
    report.status = data.get("status", "completed")
    report.extracted_owner = data.get("owner_name") or report.extracted_owner
    report.pdf_url = data.get("pdf_link") or report.pdf_url
    report.cargas_resumen = data.get("cargas_resumen") or report.cargas_resumen
    db.commit()

    # Notificare doar când statusul devine completed
    if report.status == "completed":
        user = db.query(User).filter(User.id == report.user_id).first()
        prop = db.query(Property).filter(Property.id == report.property_id).first()
        if user and user.is_active:
            trimite_email_notificare(
                user.email,
                prop.address if prop else None,
                report.extracted_owner,
                prop.ref_catastral if prop else None,
            )

    return {"message": "Actualizare înregistrată", "request_id": external_id}
