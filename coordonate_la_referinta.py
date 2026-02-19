import requests
import xml.etree.ElementTree as ET


def coordonate_la_referinta(lat, lon, srs="EPSG:4326"):
    """
    Convertește coordonate (lat, lon) în referință cadastrală folosind API-ul Catastro.
    Pentru EPSG:4326 (WGS84): X = longitudine, Y = latitudine.
    """
    # Consulta_RCCOOR = coordonate -> referință cadastrală (CPMRC = invers: ref -> coordonate). Fără punct după 'ovc'.
    url = "https://ovc.catastro.minhap.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR"
    params = {
        "SRS": srs,
        "Coordenada_X": lon,  # longitudine
        "Coordenada_Y": lat,  # latitudine
    }

    try:
        # Certificate FNMT (autorități locale ES) nu sunt în trust store-ul Python; verify=False pentru Catastro public
        response = requests.get(url, params=params, timeout=15, verify=False)
        response.raise_for_status()
        root = ET.fromstring(response.content)

        # Verificăm eroare (lerr/err/des)
        err = root.find(".//{http://www.catastro.meh.es/}des") or root.find(".//des")
        if err is not None and err.text:
            return None, err.text.strip()

        # Referința cadastrală: pc1 (7 caractere) + pc2 (7 caractere)
        pc1_el = root.find(".//{http://www.catastro.meh.es/}pc1") or root.find(".//pc1")
        pc2_el = root.find(".//{http://www.catastro.meh.es/}pc2") or root.find(".//pc2")

        if pc1_el is not None and pc2_el is not None and (pc1_el.text or pc2_el.text):
            ref_catastral = ((pc1_el.text or "") + (pc2_el.text or "")).strip()
            if ref_catastral:
                return ref_catastral, None

        # Fallback: căutăm orice element pc1/pc2 (cu sau fără namespace)
        pc1, pc2 = "", ""
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag == "pc1":
                pc1 = elem.text or ""
            elif tag == "pc2":
                pc2 = elem.text or ""
                ref_catastral = (pc1 + pc2).strip()
                if ref_catastral:
                    return ref_catastral, None
                break

        return None, "Referința cadastrală nu a fost găsită în răspuns."
    except requests.RequestException as e:
        return None, f"Eroare rețea: {e}"
    except ET.ParseError as e:
        return None, f"Eroare parsare XML: {e}"


if __name__ == "__main__":
    # Exemplu: centrul Madridului
    ref, err = coordonate_la_referinta(40.4167, -3.7033)
    if err:
        print(f"⚠️ {err}")
    else:
        print(f"🆔 Referință cadastrală: {ref}")
