import os
import requests
import xml.etree.ElementTree as ET

from catastro_ssl import get_catastro_session

# URL implicit (același string ca în main.py – fără cratimă)
_DEFAULT_CATASTRO_URL = "https://ovc.catastro.minhap.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR"


def coordonate_la_referinta(lat, lon, srs="EPSG:4326", catastro_url=None, cert_path=None):
    """
    Convertește coordonate (lat, lon) în referință cadastrală folosind API-ul Catastro.
    Pentru EPSG:4326 (WGS84): X = longitudine, Y = latitudine.
    Poți pasa catastro_url și cert_path din main.py (CATASTRO_URL, CATASTRO_CERT_PATH) pentru URL verificat 100%.
    """
    url = catastro_url or _DEFAULT_CATASTRO_URL
    params = {
        "SRS": srs,
        "Coordenada_X": lon,  # longitudine
        "Coordenada_Y": lat,  # latitudine
    }
    # Preferă verify=cert_path când main trimite CATASTRO_URL + CATASTRO_CERT_PATH (fără verify=False)
    if cert_path and os.path.isfile(cert_path):
        response = requests.get(url, params=params, timeout=15, verify=cert_path)
    else:
        session = get_catastro_session()
        if session is not False:
            response = session.get(url, params=params, timeout=15)
        else:
            response = requests.get(url, params=params, timeout=15, verify=False)

    try:
        response.raise_for_status()
        # Catastro returnează XML, nu JSON – nu folosi response.json()
        return _proceseaza_raspuns_catastro(response.content)
    except requests.RequestException as e:
        return None, f"Eroare rețea: {e}"


def _tag_local(elem):
    """Returnează numele tag-ului fără namespace."""
    if not elem.tag:
        return ""
    return elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag


def _proceseaza_raspuns_catastro(xml_content):
    """
    Procesează XML-ul de la Catastro (Consulta_RCCOOR).
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

        # Colectăm toate câmpurile utile prin iterare (namespace-uri pot varia)
        ref = ""
        address = None
        year_built = None
        cmun_ine = None
        # Câmpuri adresă: ldt (literal dirección), dir (dirección), domicilio
        address_candidates = []

        for elem in root.iter():
            tag = _tag_local(elem)
            text = (elem.text or "").strip() if elem.text else ""
            if tag == "pc1":
                ref = (ref + (elem.text or "")).strip()
            elif tag == "pc2":
                ref = (ref + (elem.text or "")).strip()
            elif tag in ("ldt", "dir", "dc", "dv", "np", "pnp", "cv"):
                if text:
                    address_candidates.append(text)
            elif tag in ("ant", "antiguedad", "AnioConstruccion", "anio"):
                if text and text.isdigit() and len(text) == 4:
                    year_built = int(text)
            elif tag in ("cmun", "cmun_ine", "ine"):
                if text:
                    cmun_ine = text

        if address_candidates:
            address = ", ".join(address_candidates)

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
