"""
Computer Vision: detectare abandon din imagini satelit (piscină „mlaștină”, vegetație).
Folosește OpenCV pentru analiza culorii; viitor: YOLO / Google Cloud Vision.
"""
from typing import Optional

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

# Prag: peste acest procent din imagine considerată „verde mlaștină” → CRITIC
PROCENT_PISCINA_CRITIC = 5.0

# Gama HSV pentru apă murdară/verde (piscină neîngrijită)
# H: 35–85 (nuante verzi), S/V: minim 50/50
VERDE_MURDAR_LOW = np.array([35, 50, 50], dtype=np.uint8)
VERDE_MURDAR_HIGH = np.array([85, 255, 255], dtype=np.uint8)

# Opțional: gama pentru albastru normal (piscină curată) – pentru contrast
# Albastru în HSV: H ~100–120
AZUR_LOW = np.array([95, 50, 100], dtype=np.uint8)
AZUR_HIGH = np.array([125, 255, 255], dtype=np.uint8)


def _ensure_ndarray(imagine_satelit):  # noqa: ANN001
    """Primește path (str), bytes sau numpy array; returnează BGR ndarray."""
    if cv2 is None:
        raise RuntimeError("opencv-python lipsește: pip install opencv-python-headless")
    if isinstance(imagine_satelit, np.ndarray):
        return imagine_satelit
    if isinstance(imagine_satelit, bytes):
        arr = np.frombuffer(imagine_satelit, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Nu s-a putut decoda imaginea din bytes.")
        return img
    if isinstance(imagine_satelit, str):
        img = cv2.imread(imagine_satelit)
        if img is None:
            raise ValueError(f"Nu s-a putut încărca imaginea: {imagine_satelit}")
        return img
    raise TypeError("imagine_satelit trebuie să fie path (str), bytes sau numpy.ndarray")


def analizeaza_stare_piscina(imagine_satelit, prag_procent: float = PROCENT_PISCINA_CRITIC):
    """
    Analizează imaginea satelit: cât % din cadru e „verde mlaștină” (apă murdară).
    Returnează dict: status ("CRITIC" | "OK"), procent_verde, mesaj.
    """
    img = _ensure_ndarray(imagine_satelit)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, VERDE_MURDAR_LOW, VERDE_MURDAR_HIGH)
    pixel_verde = np.sum(mask > 0)
    total = mask.size
    procent_verde = (pixel_verde / total) * 100.0 if total else 0.0

    if procent_verde >= prag_procent:
        return {
            "status": "CRITIC",
            "procent_verde": round(procent_verde, 2),
            "mesaj": "Piscină abandonată detectată (apă verde/maro)",
        }
    return {
        "status": "OK",
        "procent_verde": round(procent_verde, 2),
        "mesaj": "Întreținut",
    }


def puncte_culoare_in_gama(imagine_satelit, hex_low: str, hex_high: str) -> float:
    """
    Procent din imagine a cărui culoare (RGB mediu pe zone) e în gama hex_low – hex_high.
    Ex: #4B5320 (Olive Drab) până la #2E8B57 (Sea Green) pentru „piscină mlaștină”.
    Returnează procent 0–100.
    """
    def hex_to_rgb(h):
        h = h.lstrip("#")
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

    img = _ensure_ndarray(imagine_satelit)
    if img.ndim != 3:
        return 0.0
    r_low, g_low, b_low = hex_to_rgb(hex_low)
    r_high, g_high, b_high = hex_to_rgb(hex_high)
    # BGR în OpenCV
    b_min, g_min, r_min = min(b_low, b_high), min(g_low, g_high), min(r_low, r_high)
    b_max, g_max, r_max = max(b_low, b_high), max(g_low, g_high), max(r_low, r_high)
    mask_b = (img[:, :, 0] >= b_min) & (img[:, :, 0] <= b_max)
    mask_g = (img[:, :, 1] >= g_min) & (img[:, :, 1] <= g_max)
    mask_r = (img[:, :, 2] >= r_min) & (img[:, :, 2] <= r_max)
    mask = mask_b & mask_g & mask_r
    total = img.shape[0] * img.shape[1]
    return (np.sum(mask) / total) * 100.0 if total else 0.0


def fetch_google_static_satellite(
    lat: float,
    lon: float,
    api_key: str,
    zoom: int = 20,
    width: int = 400,
    height: int = 400,
) -> Optional[bytes]:
    """
    Descarcă o imagine satelit statică de la Google Maps Static API.
    Returnează bytes (PNG) sau None la eroare.
    """
    import requests
    url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?center={lat},{lon}&zoom={zoom}&size={width}x{height}"
        "&maptype=satellite&format=png"
        f"&key={api_key}"
    )
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.content
    except Exception:
        return None
