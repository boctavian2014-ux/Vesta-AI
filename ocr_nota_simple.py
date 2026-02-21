"""
OCR Nota Simple: extrage Titular, Descripción, Cargas, Dirección din PDF sau imagine
folosind OpenAI GPT-4o (Vision). Folosit de ruta /proceseaza-nota-simple/.
"""
import base64
import io
import json
import os
import re
from typing import Any, Optional

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o")

SYSTEM_PROMPT = """Eres un experto inmobiliario en España. Extrae de esta Nota Simple (documento del Registro de la Propiedad) la siguiente información en español, de forma literal cuando sea posible:

1. **Titular**: Nombre completo del propietario actual (titular o titulares).
2. **Descripción**: Descripción breve del inmueble (tipo, referencia, superficie si aparece).
3. **Cargas**: Resumen de las cargas (Hipoteca, Embargo, Afecciones Fiscales, anotaciones preventivas). Si no hay, escribe "Sin cargas".
4. **Dirección**: Dirección completa del inmueble.

Si el documento está borroso, escaneado con mala calidad, torcido o ilegible y no puedes extraer los datos con confianza, añade en tu respuesta JSON el campo "manual_check": true para avisar al usuario de que debe revisar manualmente. Si la imagen es clara y legible, no incluyas manual_check o pon "manual_check": false.

Responde ÚNICAMENTE con un JSON válido, sin markdown ni texto extra. Claves obligatorias: titular, descripcion, cargas, direccion. Opcional: manual_check (true/false).
Ejemplo: {"titular": "...", "descripcion": "...", "cargas": "...", "direccion": "...", "manual_check": false}
"""


def _pdf_first_page_to_png_bytes(pdf_bytes: bytes) -> Optional[bytes]:
    """Converte prima pagină din PDF în PNG. Necesită PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if not doc.page_count:
            return None
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=150, alpha=False)
        png_bytes = pix.tobytes(output="png")
        doc.close()
        return png_bytes
    except Exception:
        return None


def _image_to_base64(content: bytes, mime: str = "image/png") -> str:
    return base64.standard_b64encode(content).decode("ascii")


def _parse_extraction(text: str) -> dict[str, str]:
    """Extrage JSON din răspunsul modelului (poate conține markdown)."""
    text = (text or "").strip()
    # Încercare JSON direct
    try:
        # Elimină blocuri markdown ```json ... ```
        for start in ("```json", "```"):
            if start in text:
                idx = text.find(start)
                text = text[idx + len(start) :].strip()
            if text.endswith("```"):
                text = text[:-3].strip()
        obj = json.loads(text)
        out = {
            "titular": (obj.get("titular") or "").strip(),
            "descripcion": (obj.get("descripcion") or "").strip(),
            "cargas": (obj.get("cargas") or "").strip(),
            "direccion": (obj.get("direccion") or "").strip(),
        }
        if "manual_check" in obj:
            out["manual_check"] = bool(obj.get("manual_check"))
        return out
    except json.JSONDecodeError:
        pass
    # Fallback: regex pentru câmpuri
    out = {"titular": "", "descripcion": "", "cargas": "", "direccion": ""}
    for key in list(out.keys()):
        m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', text, re.IGNORECASE)
        if m:
            out[key] = m.group(1).strip()
    m_manual = re.search(r'"manual_check"\s*:\s*(true|false)', text, re.IGNORECASE)
    if m_manual:
        out["manual_check"] = m_manual.group(1).lower() == "true"
    return out


def extrage_nota_simple(file_content: bytes, filename: str = "") -> dict[str, Any]:
    """
    Analizează un fișier (PDF sau imagine) Nota Simple cu GPT-4o Vision.
    Returnează dict cu: titular, descripcion, cargas, direccion (plus eventual error).
    """
    if not OPENAI_API_KEY:
        return {"error": "OPENAI_API_KEY lipsește", "titular": "", "descripcion": "", "cargas": "", "direccion": ""}

    content_b64: Optional[str] = None
    mime = "image/png"
    lower = (filename or "").lower()

    if lower.endswith(".pdf"):
        png_bytes = _pdf_first_page_to_png_bytes(file_content)
        if not png_bytes:
            return {"error": "Nu s-a putut converti PDF-ul în imagine (instalează pymupdf)", "titular": "", "descripcion": "", "cargas": "", "direccion": ""}
        content_b64 = _image_to_base64(png_bytes, mime)
    elif lower.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
        content_b64 = _image_to_base64(file_content, "image/jpeg" if "jpg" in lower or "jpeg" in lower else "image/png")
    else:
        # Încercare PDF implicit
        if file_content[:4] == b"%PDF":
            png_bytes = _pdf_first_page_to_png_bytes(file_content)
            if png_bytes:
                content_b64 = _image_to_base64(png_bytes, mime)
        if not content_b64:
            return {"error": "Format neacceptat. Folosește PDF sau imagine (jpg/png).", "titular": "", "descripcion": "", "cargas": "", "direccion": ""}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{content_b64}"},
                        },
                    ],
                },
            ],
            max_tokens=1000,
        )
        text = (response.choices[0].message.content or "").strip()
        extracted = _parse_extraction(text)
        extracted.pop("error", None)
        return extracted
    except Exception as e:
        return {"error": str(e), "titular": "", "descripcion": "", "cargas": "", "direccion": ""}
