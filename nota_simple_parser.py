import re

# Exemplu de text brut extras dintr-o Nota Simple (simulat)
nota_simple_text = """
REGISTRO DE LA PROPIEDAD DE MADRID Nº 01
...
DESCRIPCIÓN: URBANA. Numero uno. Piso primero derecha...
TITULARIDAD: Don JUAN PÉREZ RODRÍGUEZ, con N.I.F. 12345678Z, 
titular del pleno dominio por título de compraventa...
CARGAS: Hipoteca a favor de BANCO SANTANDER por un importe de 120.000€...
"""


def extrage_date_cheie(text):
    # Căutăm numele proprietarului după cuvântul "TITULAR" sau "TITULARIDAD"
    owner_match = re.search(r"TITULAR(?:IDAD)?:\s*(?:Don|Doña)?\s*([^,.\n]+)", text)

    # Căutăm dacă există cuvântul "Hipoteca" sau "Embargo" (Sechestru)
    has_debts = "Hipoteca" in text or "Embargo" in text or "Afección" in text

    date_procesate = {
        "proprietar": owner_match.group(1).strip() if owner_match else "Nu a putut fi identificat",
        "are_datorii": "DA" if has_debts else "NU",
        "status": "Oportunitate" if "Embargo" in text else "Standard"
    }

    return date_procesate


# Rulăm parserul pe textul simulat
if __name__ == "__main__":
    rezultat = extrage_date_cheie(nota_simple_text)
    print(f"👤 Proprietar detectat: {rezultat['proprietar']}")
    print(f"💰 Are datorii/sarcini: {rezultat['are_datorii']}")
    print(f"📋 Status: {rezultat['status']}")
