"""
Context SSL pentru Catastro: trust store implicit (sistem) + fnmt_root.pem.
Rezolvă „unable to get local issuer certificate” când serverul trimite lanțul
(leaf + intermediar) și rădăcina FNMT nu e în store-ul implicit.
"""
import os
import ssl
import warnings

import requests
from requests.adapters import HTTPAdapter

# Host oficial – fără cratimă după punct (nu ovc.-catastro, altfel SSL hostname mismatch)
CATASTRO_HOST = "ovc.catastro.minhap.es"

_FNMT_PEM = os.environ.get(
    "CATASTRO_CA_BUNDLE",
    os.path.join(os.getcwd(), "fnmt_root.pem"),
)


def _catastro_ssl_context():
    """Context SSL: default (sistem) + fnmt_root.pem dacă există."""
    if not os.path.isfile(_FNMT_PEM):
        return None
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(cafile=_FNMT_PEM)
    return ctx


class _CatastroAdapter(HTTPAdapter):
    """Adapter care folosește contextul SSL cu FNMT root pentru Catastro."""

    def init_poolmanager(self, *args, **kwargs):
        ctx = _catastro_ssl_context()
        if ctx is not None:
            kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)


def get_catastro_session():
    """
    Returnează un requests.Session care folosește context SSL mergat (sistem + fnmt_root.pem),
    sau False dacă fnmt_root.pem lipsește (atunci caller-ul folosește verify=False).
    """
    if not os.path.isfile(_FNMT_PEM):
        warnings.warn(
            "fnmt_root.pem lipsește: verificare SSL Catastro dezactivată (risc MITM). "
            "Descarcă AC Raíz FNMT-RCM de la https://www.sede.fnmt.gob.es/descargas/certificados-raiz-de-la-fnmt.",
            UserWarning,
            stacklevel=2,
        )
        return False
    session = requests.Session()
    session.mount("https://", _CatastroAdapter())
    return session
