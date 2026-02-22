import zeep
from zeep.transports import Transport

from catastro_ssl import CATASTRO_HOST

# Sesiune securizată Catastro (din main)
from main import get_catastro_http_client

# WSDL: obligatoriu www1.sedecatastro.gob.es (certificat SSL). NU folosi ovc.catastro.minhap.es (hostname mismatch).
WSDL_URL = f"https://{CATASTRO_HOST}/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx?WSDL"


def cauta_imobil_spania(provincie, municipiu, strada, numar):
    wsdl_url = WSDL_URL

    try:
        session = get_catastro_http_client()
        transport = Transport(session=session)
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
