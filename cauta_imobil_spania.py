import zeep
from zeep.transports import Transport

from catastro_ssl import CATASTRO_HOST

# Sesiune securizată Catastro (din main)
from main import get_catastro_http_client

# WSDL: URL corect cu ?WSDL. Sesiunea trebuie să aibă User-Agent (session.headers) ca serverul să nu returneze 404.
WSDL_URL = f"https://{CATASTRO_HOST}/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx?WSDL"

# User-Agent obligatoriu – serverul blochează cereri fără antet valid (404). Zeep suprascrie în Transport.__init__, deci refacem după.
_WSDL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "application/xml, text/xml, */*",
    "Accept-Language": "es-ES,es;q=0.9",
}


def cauta_imobil_spania(provincie, municipiu, strada, numar):
    wsdl_url = WSDL_URL

    try:
        session = get_catastro_http_client()
        transport = Transport(session=session)
        # Zeep overwrites session.headers['User-Agent'] in Transport.__init__; restore browser headers
        # so the WSDL GET uses our User-Agent (server returns 404 without it).
        session.headers.update(_WSDL_HEADERS)
        client = zeep.Client(wsdl=wsdl_url, transport=transport)

        # Apelăm funcția care caută Referința Catastrală după adresă
        # Parametrii: Provincia, Municipiul, Tip Stradă (gol pt căutare generală), Nume Stradă, Număr
        result = client.service.ConsultaNumero(
            Provincia=provincie.upper(),
            Municipio=municipiu.upper(),
            Sigla="",
            Calle=strada.upper(),
            Numero=numar
        )

        # Extragem datele principale
        if 'control' in result and 'udra' in result['control']:
            # Referința cadastrală este compusă din două părți în răspunsul lor
            pc1 = result['lrcd']['rcd'][0]['pc']['pc1']
            pc2 = result['lrcd']['rcd'][0]['pc']['pc2']
            ref_catastral = pc1 + pc2

            print("✅ Imobil Găsit!")
            print(f"📍 Adresa: {strada} {numar}, {municipiu}")
            print(f"🆔 Referință Catastrală: {ref_catastral}")
            return ref_catastral
        else:
            print("❌ Nu am găsit nimic la această adresă. Verifică ortografia.")
            return None

    except Exception as e:
        print(f"⚠️ Eroare la conectarea cu Catastro: {e}")
        return None


# --- TESTARE ---
# Exemplu: O adresă din Madrid (Calle Mayor, 1)
if __name__ == "__main__":
    referinta = cauta_imobil_spania("MADRID", "MADRID", "MAYOR", "1")