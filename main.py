import logging
import os
import shutil
import uuid
import xml.etree.ElementTree as ET
import urllib3
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)

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
# Consulta date descriptive (antigüedad = an construcție) după referință cadastrală
CATASTRO_DNPRC_URL = "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejeroCodigos.asmx/Consulta_DNPRC_Codigos"

from database import DetailedReport, Property, SessionLocal, User
from red_flags import calculeaza_scor_oportunitate
from vision_abandon import analizeaza_stare_piscina, fetch_google_static_satellite
from carta_oferta import genera_carta_oferta

# Identificare: coordonate -> referință cadastrală (folosim modulul cu SSL)
from coordonate_la_referinta import coordonate_la_referinta

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


def notifica_admin_plata_orfana(subject: str, detail: str) -> None:
    """
    Alertă administrator când o plată reușită nu poate fi legată de un raport (property_id lipsă/invalid).
    MVP: logging.error + print. Opțional: setează ADMIN_EMAIL în .env și deblochează SMTP pentru email.
    """
    logger.error("%s | %s", subject, detail)
    print(f"🚨 ADMIN ALERT: {subject} | {detail}")
    admin_email = os.getenv("ADMIN_EMAIL", "").strip()
    if admin_email:
        # Producție: deblochează trimiterea efectivă (ex. SMTP / SendGrid)
        # msg = MIMEText(detail, "plain", "utf-8")
        # msg["Subject"] = f"[Vesta] {subject}"
        # ... smtplib sau SendGrid ...
        print(f"📧 [MVP] Ar fi trimis alertă către admin: {admin_email}")


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


@app.get("/version")
def version():
    """Versiune API – fără analiză satelit; identificare doar din Catastro (+ fallback adresă)."""
    return {"message": "OpenHouse Spain API", "identificare": "Catastro + fallback adresă"}


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


def _consulta_dnprc_antiguedad(ref_catastral: str, cmun_ine: Optional[str] = None) -> Optional[int]:
    """
    Cerere rapidă către Consulta_DNPRC_Codigos (Catastro) pentru a obține antigüedad (anul construcției).
    ref_catastral: referința cadastrală (min 14 caractere). Din ea extragem CodigoProvincia (2) și CodigoMunicipio (3).
    cmun_ine: cod INE municipiu dacă e disponibil din răspunsul Consulta_RCCOOR.
    Returnează anul (int) sau None.
    """
    ref = (ref_catastral or "").strip()
    if len(ref) < 14:
        return None
    try:
        codigo_provincia = ref[:2]
        codigo_municipio = ref[2:5]
        codigo_municipio_ine = (cmun_ine or codigo_municipio).strip()
        params = {
            "CodigoProvincia": codigo_provincia,
            "CodigoMunicipio": codigo_municipio,
            "CodigoMunicipioINE": codigo_municipio_ine,
            "RC": ref,
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; OpenHouseSpain/1.0)",
            "Accept": "application/xml, text/xml, */*",
            "Accept-Language": "es-ES,es;q=0.9",
        }
        response = requests.get(
            CATASTRO_DNPRC_URL,
            params=params,
            headers=headers,
            verify=False,
            timeout=8,
        )
        if response.status_code != 200:
            return None
        root = ET.fromstring(response.content)
        # Căutăm antigüedad în XML (tag-uri posibile: ant, Antiguedad, etc.)
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if elem.tag and "}" in elem.tag else (elem.tag or "")
            if tag.lower() in ("ant", "antiguedad"):
                text = (elem.text or "").strip()
                if text and text.isdigit():
                    year = int(text)
                    if 1800 <= year <= 2030:
                        return year
        return None
    except Exception:
        return None


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
        data = property_to_dict(existing_prop)
        ref = existing_prop.ref_catastral or ""
        addr = existing_prop.address or ""
        return {
            "success": True,
            "ref_catastral": ref,
            "address": addr,
            "year_built": getattr(existing_prop, "year_built", None),
            "source": "baza_de_date",
            "status": "succes",
            "referinta": ref,
            "referinta_cadastrala": ref,
            "data": data,
            "scor": data.get("scor_oportunitate"),
        }

    # 2. Apelăm coordonate_la_referinta (Catastro) – returnează dict cu ref_catastral, address, year_built, cmun_ine
    result = None
    try:
        data_coord, err = coordonate_la_referinta(
            location.lat, location.lon,
            catastro_url=CATASTRO_URL,
            cert_path=CATASTRO_CERT_PATH if os.path.isfile(CATASTRO_CERT_PATH) else None,
        )
        if err is None and data_coord and (data_coord.get("ref_catastral") or "").strip():
            data_block = {
                "ref_catastral": (data_coord.get("ref_catastral") or "").strip(),
                "address": data_coord.get("address"),
                "year_built": data_coord.get("year_built"),
                "cmun_ine": data_coord.get("cmun_ine"),
            }
            # Dacă anul lipsește, a doua cerere rapidă: Consulta_DNPRC pentru antigüedad
            if data_block.get("year_built") is None:
                year_ant = _consulta_dnprc_antiguedad(
                    data_block["ref_catastral"],
                    data_block.get("cmun_ine"),
                )
                if year_ant is not None:
                    data_block["year_built"] = year_ant
            result = {"status": "success", "data": data_block}
    except Exception as e:
        result = {"status": "error", "message": str(e)}

    if result is None:
        try:
            result = get_catastro_data(location.lat, location.lon)
            # Dacă avem doar ref (fără an), încercăm Consulta_DNPRC pentru antigüedad
            if result.get("status") == "success" and result.get("data") and result["data"].get("year_built") is None:
                ref = (result["data"].get("ref_catastral") or "").strip()
                if ref:
                    year_ant = _consulta_dnprc_antiguedad(ref, None)
                    if year_ant is not None:
                        result["data"]["year_built"] = year_ant
        except Exception as e:
            result = {"status": "error", "message": str(e)}

    if result.get("status") != "success":
        fallback = _identifica_imobil_fallback_adresa(location.lat, location.lon)
        if fallback and fallback.get("status") == "success":
            result = fallback
        else:
            raise HTTPException(
                status_code=422,
                detail=result.get("message") or "Referință indisponibilă pe hartă, te rugăm să folosești opțiunea de căutare după adresă.",
            )

    data_block = result.get("data")
    if not data_block or not isinstance(data_block, dict):
        raise HTTPException(status_code=502, detail="Răspuns invalid de la serviciul de identificare.")
    referinta_cadastrala = (data_block.get("ref_catastral") or "").strip()
    if not referinta_cadastrala:
        raise HTTPException(status_code=422, detail="Referință cadastrală lipsă. Încercați căutarea după adresă.")

    # 3. Salvăm în baza de date (evităm duplicate după ref_catastral)
    existing_by_ref = db.query(Property).filter(Property.ref_catastral == referinta_cadastrala).first()
    if existing_by_ref:
        data = property_to_dict(existing_by_ref)
        return {
            "success": True,
            "ref_catastral": referinta_cadastrala,
            "address": data.get("address") or "",
            "year_built": data.get("year_built"),
            "source": "baza_de_date",
            "status": "succes",
            "referinta": referinta_cadastrala,
            "referinta_cadastrala": referinta_cadastrala,
            "data": data,
            "scor": data.get("scor_oportunitate"),
        }

    scor_initial = calculeaza_scor_oportunitate({"year_built": data_block.get("year_built")}, None)
    noua_proprietate = Property(
        ref_catastral=referinta_cadastrala,
        lat=location.lat,
        lon=location.lon,
        address=data_block.get("address"),
        year_built=data_block.get("year_built"),
        sq_meters=None,
        scor_oportunitate=scor_initial,
    )
    db.add(noua_proprietate)
    db.commit()
    db.refresh(noua_proprietate)

    data = property_to_dict(noua_proprietate)
    return {
        "success": True,
        "ref_catastral": referinta_cadastrala,
        "address": data.get("address") or "",
        "year_built": data.get("year_built"),
        "source": "catastro_api",
        "status": "succes",
        "referinta": referinta_cadastrala,
        "referinta_cadastrala": referinta_cadastrala,
        "data": data,
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
async def creeaza_plata(body: CreeazaPlataRequest):
    """
    Creează un PaymentIntent Stripe: 19€ (standard) sau 50€ (premium).
    Primește property_id și email; le pune în metadata pentru webhook (payment_intent.succeeded)
    ca să creeze raportul cu status 'processing'.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Stripe nu este configurat (STRIPE_SECRET_KEY lipsește).",
        )
    tip = body.tip or "standard"
    suma = 5000 if tip == "premium" else 1900
    email = (body.email or "necunoscut@email.com").strip().lower()
    property_id = body.property_id if body.property_id is not None else 0

    try:
        intent = stripe.PaymentIntent.create(
            amount=suma,
            currency="eur",
            automatic_payment_methods={"enabled": True},
            metadata={
                "tip_raport": tip,
                "email": email,
                "property_id": str(property_id),
            },
        )
        return {"clientSecret": intent.client_secret}
    except stripe.error.StripeError as e:
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
        pi_id = payment_intent.get("id", "")
        amount = payment_intent.get("amount", 0) / 100
        print(f"💰 Plată confirmată pentru: {amount} EUR")
        meta = payment_intent.get("metadata") or {}
        email = (meta.get("email") or "").strip().lower()
        try:
            property_id = int(meta.get("property_id", 0))
        except (TypeError, ValueError):
            property_id = 0

        # Logging critic: plată orfană (property_id lipsă sau 0)
        if not property_id:
            msg = (
                f"ALERTA PLATA ORFANA: S-a incasat plata de la {email}, dar property_id lipseste! "
                f"payment_intent_id={pi_id}"
            )
            logger.error(msg)
            notifica_admin_plata_orfana("Plată orfană (property_id lipsă)", f"email={email}, payment_intent_id={pi_id}")
            return JSONResponse(content={"status": "success", "warning": "property_id_missing"})

        if email and property_id:
            # Idempotență: evităm duplicate la retrimitere Stripe
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

            # Validare: property_id trebuie să existe în DB; nu returnăm 500/404 ca să nu retrimită Stripe
            prop = db.query(Property).filter(Property.id == property_id).first()
            if not prop:
                msg = (
                    f"ALERTA: Plată reușită dar proprietatea id={property_id} nu există în DB. "
                    f"email={email}, payment_intent_id={pi_id}"
                )
                logger.error(msg)
                notifica_admin_plata_orfana("Proprietate negăsită la plată", f"property_id={property_id}, email={email}, payment_intent_id={pi_id}")
                return JSONResponse(content={"status": "success", "warning": "property_not_found"})

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

    # property_id și user_id din metadata (setate la create-checkout-session) pentru raport cu status 'processing'
    metadata = session.get("metadata") or {}
    try:
        property_id = int(metadata.get("property_id", 0))
    except (TypeError, ValueError):
        property_id = 0
    try:
        user_id = int(metadata.get("user_id", 0))
    except (TypeError, ValueError):
        user_id = 0

    # Logging critic: metadata incomplet – returnăm 200 ca Stripe să nu retrimită
    if not property_id or not user_id:
        msg = (
            f"ALERTA PLATA ORFANA: checkout.session.completed fără property_id sau user_id în metadata! "
            f"session_id={session_id}, metadata={metadata}"
        )
        logger.error(msg)
        notifica_admin_plata_orfana(
            "Plată orfană (metadata incomplet)",
            f"session_id={session_id}, property_id={property_id}, user_id={user_id}",
        )
        return JSONResponse(content={"received": True, "warning": "metadata_incomplete"})

    # Validare: proprietatea trebuie să existe în DB; nu returnăm 404/500 ca să nu retrimită Stripe
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        msg = (
            f"ALERTA: checkout.session.completed dar proprietatea id={property_id} nu există în DB. "
            f"session_id={session_id}"
        )
        logger.error(msg)
        notifica_admin_plata_orfana(
            "Proprietate negăsită la checkout",
            f"property_id={property_id}, session_id={session_id}",
        )
        return JSONResponse(content={"received": True, "warning": "property_not_found"})

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        msg = (
            f"ALERTA: checkout.session.completed dar user id={user_id} nu există în DB. "
            f"session_id={session_id}"
        )
        logger.error(msg)
        notifica_admin_plata_orfana(
            "Utilizator negăsit la checkout",
            f"user_id={user_id}, session_id={session_id}",
        )
        return JSONResponse(content={"received": True, "warning": "user_not_found"})

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

    embargo_caducado = extracted.get("embargo_caducado", False)
    asunto, cuerpo = genera_carta_oferta(
        titular or "Propietario/a", direccion, cargas_resumen, embargo_caducado=embargo_caducado
    )

    return {
        "extracted": {
            "titular": titular,
            "descripcion": extracted.get("descripcion", ""),
            "cargas": cargas_resumen,
            "caducidad_cargas": extracted.get("caducidad_cargas", ""),
            "direccion": direccion,
            "embargo_caducado": embargo_caducado,
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

    embargo_caducado = extracted.get("embargo_caducado", False)
    asunto, cuerpo = genera_carta_oferta(
        titular or "Propietario/a", direccion, cargas_resumen, embargo_caducado=embargo_caducado
    )

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
            "caducidad_cargas": extracted.get("caducidad_cargas", ""),
            "direccion": direccion,
            "embargo_caducado": embargo_caducado,
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
