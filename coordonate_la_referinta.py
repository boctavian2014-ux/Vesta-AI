import xml.etree.ElementTree as ET

import requests

# Helper-ul din main (sesiune securizată Catastro: prod = FNMT obligatoriu, dev = fallback verify=False)
from main import CATASTRO_URL, get_catastro_http_client

# Limita pentru log XML (evită flood în consolă)
_CATASTRO_LOG_XML_MAX = 4000


def coordonate_la_referinta(lat, lon, srs="EPSG:4258", catastro_url=None, cert_path=None):
    """
    Convertește coordonate (lat, lon) în referință cadastrală.
    Endpoint-ul Catastro este SOAP (.asmx); folosim GET cu query (ConsultaCPMRC) ca interfață simplificată.
    Pentru SOAP corect: zeep + envelope XML (parametri în body, nu în URL) sau metoda REST compatibilă documentată de ei.
    Parametri actuali: SRS, CoordenadaX, CoordenadaY. SRS implicit EPSG:4258 (ETRS89).
    """
    url = catastro_url or CATASTRO_URL
    srs_val = (srs or "").strip() or "EPSG:4258"  # sau EPSG:4326 dacă 4258 eșuează
    params = {
        "SRS": srs_val,
        "CoordenadaX": f"{float(lon):.8f}",   # FĂRĂ underscore – ConsultaCPMRC acceptă doar CoordenadaX/CoordenadaY
        "CoordenadaY": f"{float(lat):.8f}",
    }
    # CRITIC: Simulează un browser real – altfel Catastro returnează pagină HTML de eroare (identifică automatismul).
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/xml, text/xml, */*",
        "Accept-Language": "es-ES,es;q=0.9",
    }
    try:
        session = get_catastro_http_client()
        response = session.get(url, params=params, headers=headers, timeout=15)
        # Tratare explicită 404: Catastro returnează HTML "No se puede procesar..."; nu parsăm XML → evităm 422.
        if response.status_code == 404:
            try:
                body = response.text or response.content.decode("utf-8", errors="replace")
            except Exception:
                body = ""
            if "No se puede procesar" in body or "no se puede procesar" in body.lower():
                print(f"❌ Catastro 404: {response.url}")
                return None, "Catastro nu poate procesa coordonatele"
        response.raise_for_status()
        _log_catastro_request(response)
        return _proceseaza_raspuns_catastro(response.content)
    except Exception as e:
        print(f"❌ Eroare apel Catastro SSL/Network: {e}")
        return None, f"Eroare conexiune Catastro: {str(e)}"


def _log_catastro_request(response):
    """Printează URL-ul complet trimis către Catastro și răspunsul XML brut (pentru debug)."""
    print("[Catastro] URL complet:", response.url)
    try:
        raw = response.text if hasattr(response, "text") else response.content.decode(response.encoding or "utf-8", errors="replace")
        snippet = raw[: _CATASTRO_LOG_XML_MAX] + ("..." if len(raw) > _CATASTRO_LOG_XML_MAX else "")
        print("[Catastro] Răspuns XML (brut):", snippet)
    except Exception as e:
        print("[Catastro] Nu s-a putut decoda răspunsul:", e)


def _tag_local(elem):
    """Returnează numele tag-ului fără namespace."""
    if not elem.tag:
        return ""
    return elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag


def _text_full(elem):
    """Textul elementului + toți copiii (pentru tag-uri unde valoarea e în subelemente)."""
    if elem is None:
        return ""
    direct = (elem.text or "").strip()
    child_text = " ".join((e.text or "").strip() for e in elem.iter() if e is not elem and (e.text or "").strip())
    return (direct + " " + child_text).strip()


def _find_recursive(root, tag_wanted):
    """
    Caută recursiv primul element al cărui tag local (fără namespace) este tag_wanted.
    tag_wanted: string, ex. 'ldt', 'cn', 'v'. Comparația e case-insensitive.
    Returnează elementul sau None.
    """
    tag_wanted = (tag_wanted or "").strip().lower()
    if not tag_wanted:
        return None
    for elem in root.iter():
        if _tag_local(elem).lower() == tag_wanted:
            return elem
    return None


def _find_all_recursive(root, tag_wanted):
    """Caută toate elementele cu tag local == tag_wanted (case-insensitive). Returnează listă de elemente."""
    tag_wanted = (tag_wanted or "").strip().lower()
    if not tag_wanted:
        return []
    return [e for e in root.iter() if _tag_local(e).lower() == tag_wanted]


def _proceseaza_raspuns_catastro(xml_content):
    """
    Procesează XML-ul de la Catastro (ConsultaCPMRC / Consulta_RCCOOR).
    Returnează (dict, None) cu ref_catastral, address, year_built (dacă în XML), cmun_ine,
    sau (None, mesaj_eroare).
    """
    try:
        root = ET.fromstring(xml_content)
        ns = {"cat": "http://www.catastro.minhap.es/"}

        # Mesaj de eroare de la Catastro (ex. punct în afara Spaniei)
        error_el = root.find(".//cat:des", ns)
        if error_el is not None and error_el.text and error_el.text.strip():
            return None, error_el.text.strip()

        # 1) Adresă: find_recursive pentru <ldt> (adresa completă)
        ldt_el = _find_recursive(root, "ldt")
        address = _text_full(ldt_el) if ldt_el else None
        if not address:
            cn_elems = _find_all_recursive(root, "cn")
            v_elems = _find_all_recursive(root, "v")
            cn_parts = [_text_full(e) for e in cn_elems if _text_full(e)]
            v_parts = [_text_full(e) for e in v_elems if _text_full(e)]
            if cn_parts or v_parts:
                address = " ".join(cn_parts + v_parts)

        # 2) Referință, an, cmun_ine și fallback adresă prin iterare
        ref = ""
        year_built = None
        cmun_ine = None
        address_candidates = []
        address_parts = []

        for elem in root.iter():
            tag = _tag_local(elem)
            tag_lower = tag.lower() if tag else ""
            text = (elem.text or "").strip()
            full = _text_full(elem)
            val = full or text
            if tag == "pc1":
                ref = (ref + (elem.text or "")).strip()
            elif tag == "pc2":
                ref = (ref + (elem.text or "")).strip()
            elif tag_lower in ("ldtr", "dc", "dir") and val and len(val) > 2:
                address_candidates.append(val)
            elif tag_lower in ("cv", "nv", "tv", "pnp", "np", "dv", "nomvia", "num", "nm"):
                if val:
                    address_parts.append(val)
            elif tag_lower in ("ant", "antiguedad", "anioconstruccion", "anio"):
                if text and text.isdigit():
                    y = int(text)
                    if len(text) == 4 and 1800 <= y <= 2030:
                        year_built = y
            elif tag_lower in ("cmun", "cmun_ine", "ine"):
                if text:
                    cmun_ine = text

        if not address and address_candidates:
            address = ", ".join(address_candidates)
        if not address and address_parts:
            address = " ".join(address_parts)

        if ref:
            return {
                "ref_catastral": ref,
                "address": address,
                "year_built": year_built,
                "cmun_ine": cmun_ine,
            }, None

        # Fallback: doar pc1+pc2 cu namespace explicit
        pc1_el = root.find(".//cat:pc1", ns)
        pc2_el = root.find(".//cat:pc2", ns)
        if pc1_el is not None and pc2_el is not None:
            ref = (pc1_el.text or "") + (pc2_el.text or "")
            ref = ref.strip()
            if ref:
                return {"ref_catastral": ref, "address": address, "year_built": year_built, "cmun_ine": cmun_ine}, None

        pc1_el = root.find(".//{http://www.catastro.meh.es/}pc1")
        pc2_el = root.find(".//{http://www.catastro.meh.es/}pc2")
        if pc1_el is not None and pc2_el is not None:
            ref = (pc1_el.text or "") + (pc2_el.text or "")
            ref = ref.strip()
            if ref:
                return {"ref_catastral": ref, "address": address, "year_built": year_built, "cmun_ine": cmun_ine}, None

        return None, "Referință negăsită în XML"
    except ET.ParseError as e:
        return None, f"Eroare parsare XML: {e}"
    except Exception as e:
        return None, f"Eroare procesare date: {e}"


if __name__ == "__main__":
    # Exemplu: centrul Madridului
    data, err = coordonate_la_referinta(40.4167, -3.7033)
    if err:
        print(f"⚠️ {err}")
    else:
        print(f"🆔 Referință: {data.get('ref_catastral')}, Adresă: {data.get('address')}, An: {data.get('year_built')}")
