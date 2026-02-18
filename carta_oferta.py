"""
Generare scrisoare de ofertă (propuesta de adquisición) pe baza raportului Nota Simple.
Date: proprietar extras (OCR), adresă, eventual rezumat Cargas.
"""

from typing import Optional

PLANTILLA_ASUNTO = "Propuesta de adquisición - {direccion}"

PLANTILLA_CUERPO = """Estimado/a {nombre_propietario},

Le escribo en relación con su propiedad ubicada en {direccion}. A través de nuestro análisis de mercado, hemos identificado que el inmueble podría beneficiarse de una gestión activa de sus cargas actuales.

{parrafo_cargas}

Nuestra firma se especializa en la compra directa de activos con incidencias jurídicas, ofreciendo:

• Liquidación inmediata de deudas con la Agencia Tributaria y entidades bancarias.
• Pago al contado (Cash) por el valor remanente.
• Gestión burocrática gratuita ante el Registro de la Propiedad.

Si desea una oferta no vinculante, por favor contacte con nosotros.

Atentamente,
[Platforma Ta] - Málaga Investment Team
"""

PARRAFO_CARGAS_DEFAULT = (
    "Hemos detectado anotaciones preventivas y cargas hipotecarias que podrían complicar su situación financiera."
)


def genera_carta_oferta(
    nombre_propietario: str,
    direccion: str,
    cargas_resumen: Optional[str] = None,
) -> tuple[str, str]:
    """
    Returnează (asunto, cuerpo) pentru scrisoarea de ofertă.
    nombre_propietario: ex. "Don FELIPE MORENO SÁNCHEZ"
    direccion: ex. "Calle Ejemplo, 12, Málaga"
    cargas_resumen: opțional, ex. "Embargo 2023, Hipoteca Caixabank" – dacă lipsește se folosește text generic.
    """
    nombre = (nombre_propietario or "Propietario/a").strip()
    direccion = (direccion or "Málaga").strip()

    if cargas_resumen and cargas_resumen.strip():
        parrafo_cargas = (
            f"Hemos detectado {cargas_resumen.strip()} que podrían complicar su situación financiera."
        )
    else:
        parrafo_cargas = PARRAFO_CARGAS_DEFAULT

    asunto = PLANTILLA_ASUNTO.format(direccion=direccion)
    cuerpo = PLANTILLA_CUERPO.format(
        nombre_propietario=nombre,
        direccion=direccion,
        parrafo_cargas=parrafo_cargas,
    )
    return asunto, cuerpo
