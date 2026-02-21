"""
Generează PDF pentru scrisoarea de ofertă (propuesta de adquisición).
Folosește fpdf2 cu font Unicode pentru diacritice spaniole (ñ, á, é, í, ó, ú, ¿, ¡).
Pentru font complet: pune DejaVuSansCondensed.ttf în folderul font/ (vezi README în font/).
"""
import os
from pathlib import Path

# Margini A4 (25mm ≈ 72/25.4*25 pt)
MARGIN_MM = 25
GOLD_RGB = (198, 146, 20)  # auriu discret pentru header
FONT_NAME = "DejaVuSansCondensed"
FONT_DIR = "font"


def _get_font_path() -> Path | None:
    """Cale către font Unicode (DejaVu). Caută în font/, apoi în directorul curent."""
    base = Path(__file__).resolve().parent
    for name in ("DejaVuSansCondensed.ttf", "DejaVuSans.ttf"):
        for folder in (FONT_DIR, "fonts", ""):
            path = base / folder / name if folder else base / name
            if path.is_file():
                return path
    return None


def exporta_scrisoare_pdf(
    nombre_propietario: str,
    direccion: str,
    cuerpo_carta: str,
    output_path: str | Path,
) -> str:
    """
    Generează un PDF A4 cu scrisoarea de ofertă.

    - Header: "VESTA AI - Informe de Análisis y Propuesta" (text auriu).
    - Conținut: nombre_propietario, direccion, cuerpo_carta (UTF-8, diacritice spaniole).
    - Footer: "Documento generado automáticamente por Vesta AI - Málaga Investment Division".

    Returnează calea absolută către fișierul generat.
    """
    from fpdf import FPDF

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margin(0)

    font_path = _get_font_path()
    use_unicode = font_path is not None
    if use_unicode:
        pdf.add_font(family=FONT_NAME, fname=str(font_path))
    font_use = FONT_NAME if use_unicode else "Helvetica"

    margin_pt = MARGIN_MM * 72 / 25.4
    pdf.set_left_margin(margin_pt)
    pdf.set_right_margin(margin_pt)
    pdf.set_top_margin(margin_pt)

    pdf.set_font(font_use, size=11)

    # Header – text auriu
    pdf.set_y(margin_pt)
    pdf.set_text_color(*GOLD_RGB)
    pdf.set_font(font_use, size=14)
    pdf.cell(0, 10, "VESTA AI - Informe de Análisis y Propuesta", align="C", new_x="lmargin", new_y="next")
    pdf.ln(6)

    # Revenim la negru pentru conținut
    pdf.set_text_color(0, 0, 0)
    pdf.set_font(font_use, size=11)

    # Proprietar și adresă
    if nombre_propietario:
        pdf.multi_cell(0, 6, f"Propietario: {nombre_propietario}", new_x="lmargin", new_y="next")
    if direccion:
        pdf.multi_cell(0, 6, f"Dirección: {direccion}", new_x="lmargin", new_y="next")
    pdf.ln(4)

    # Corpul scrisorii
    if cuerpo_carta:
        pdf.multi_cell(0, 6, cuerpo_carta, new_x="lmargin", new_y="next")

    # Footer
    pdf.ln(10)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font(font_use, size=8)
    pdf.cell(
        0,
        6,
        "Documento generado automáticamente por Vesta AI - Málaga Investment Division",
        align="C",
        new_x="lmargin",
        new_y="next",
    )

    pdf.output(str(output_path))
    return str(output_path.resolve())
