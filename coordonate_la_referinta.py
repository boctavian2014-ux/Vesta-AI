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


def _proceseaza_raspuns_catastro(xml_content):
    """
    Procesează XML-ul de la Catastro. Folosește namespace-ul oficial – fără el,
    root.find nu găsește tag-urile pc1/pc2 și returnează None.
    Returnează (referinta_completa, None) sau (None, mesaj_eroare).
    """
    try:
        root = ET.fromstring(xml_content)
        # Namespace oficial Catastro (obligatoriu pentru căutare)
        ns = {"cat": "http://www.catastro.minhap.es/"}

        # Mesaj de eroare de la Catastro (ex. punct în afara Spaniei)
        error_el = root.find(".//cat:des", ns)
        if error_el is not None and error_el.text and error_el.text.strip():
            return None, error_el.text.strip()

        # Referința cadastrală: pc1 + pc2
        pc1_el = root.find(".//cat:pc1", ns)
        pc2_el = root.find(".//cat:pc2", ns)
        if pc1_el is not None and pc2_el is not None:
            ref = (pc1_el.text or "") + (pc2_el.text or "")
            ref = ref.strip()
            if ref:
                return ref, None

        # Fallback: namespace în acolade (unele răspunsuri)
        pc1_el = root.find(".//{http://www.catastro.meh.es/}pc1")
        pc2_el = root.find(".//{http://www.catastro.meh.es/}pc2")
        if pc1_el is not None and pc2_el is not None:
            ref = (pc1_el.text or "") + (pc2_el.text or "")
            ref = ref.strip()
            if ref:
                return ref, None

        # Fallback: iterare fără namespace
        pc1, pc2 = "", ""
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if elem.tag and "}" in elem.tag else (elem.tag or "")
            if tag == "pc1":
                pc1 = elem.text or ""
            elif tag == "pc2":
                pc2 = elem.text or ""
                ref = (pc1 + pc2).strip()
                if ref:
                    return ref, None
                break

        return None, "Referință negăsită în XML"
    except ET.ParseError as e:
        return None, f"Eroare parsare XML: {e}"
    except Exception as e:
        return None, f"Eroare procesare date: {e}"


if __name__ == "__main__":
    # Exemplu: centrul Madridului
    ref, err = coordonate_la_referinta(40.4167, -3.7033)
    if err:
        print(f"⚠️ {err}")
    else:
        print(f"🆔 Referință cadastrală: {ref}")
