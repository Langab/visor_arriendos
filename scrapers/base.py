"""
Esquema normalizado y utilidades compartidas por todos los scrapers.

Cada scraper produce una lista de dicts con la MISMA estructura (ver Listing),
y la guarda en data/raw/<fuente>.json. Así el consolidador puede juntarlos
sin saber de dónde vienen.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import hashlib
from dataclasses import dataclass, asdict, field
from typing import Optional

# Permite importar config.py estando dentro de scrapers/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402

import requests  # noqa: E402


# ---------------------------------------------------------------------------
# Esquema de una propiedad (campos que pide el usuario + extras útiles)
# ---------------------------------------------------------------------------
@dataclass
class Listing:
    fuente: str                       # portal de origen (ej. "portalinmobiliario")
    url: str                          # link a la propiedad oficial
    titulo: str = ""
    precio_clp: Optional[int] = None  # arriendo en CLP (convertido si venía en UF)
    precio_original: str = ""         # texto crudo del precio publicado
    gastos_comunes_clp: Optional[int] = None
    dormitorios: Optional[int] = None
    banos: Optional[int] = None
    superficie_m2: Optional[float] = None
    direccion: str = ""               # dirección / ubicación tal cual aparece
    comuna: str = ""
    barrio: str = ""
    corredor: Optional[bool] = None   # True si lo publica una corredora
    plazo_entrega: str = ""           # ej. "Entrega inmediata"
    imagen: str = ""                  # thumbnail si está disponible
    lat: Optional[float] = None
    lng: Optional[float] = None
    id: str = ""                      # id estable para deduplicar
    extraido_en: str = ""             # timestamp ISO

    def fill_id(self):
        """Genera un id estable a partir de la URL (sin querystring)."""
        clave = self.url.split("?")[0].split("#")[0].strip().lower()
        if not clave:
            clave = f"{self.fuente}|{self.titulo}|{self.precio_clp}|{self.direccion}".lower()
        self.id = hashlib.md5(clave.encode("utf-8")).hexdigest()[:16]
        return self


# ---------------------------------------------------------------------------
# HTTP helper con reintentos y cabeceras realistas
# ---------------------------------------------------------------------------
def get(url: str, *, params: dict | None = None, retries: int = 2) -> Optional[requests.Response]:
    headers = {
        "User-Agent": config.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    }
    for intento in range(retries + 1):
        try:
            r = requests.get(url, params=params, headers=headers,
                              timeout=config.REQUEST_TIMEOUT)
            if r.status_code == 200:
                return r
            log(f"  HTTP {r.status_code} en {url}")
        except requests.RequestException as e:
            log(f"  error de red ({e.__class__.__name__}) en {url}")
        time.sleep(config.PAUSA_ENTRE_REQUESTS * (intento + 1))
    return None


def log(msg: str):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Parsing de precios y números
# ---------------------------------------------------------------------------
_uf_cache: dict = {}


def uf_to_clp() -> int:
    """Valor UF en vivo (mindicador.cl) con fallback configurable."""
    if "valor" in _uf_cache:
        return _uf_cache["valor"]
    valor = config.UF_TO_CLP_FALLBACK
    try:
        r = requests.get("https://mindicador.cl/api/uf", timeout=10)
        if r.ok:
            valor = int(round(r.json()["serie"][0]["valor"]))
            log(f"  UF en vivo: ${valor:,}".replace(",", "."))
    except Exception:
        log(f"  (usando UF fallback ${valor:,})".replace(",", "."))
    _uf_cache["valor"] = valor
    return valor


def parse_precio(texto: str) -> tuple[Optional[int], str]:
    """
    Convierte un precio publicado a CLP entero.
    Reconoce '$ 750.000', 'UF 13', '13,5 UF', etc.
    Devuelve (precio_clp, texto_original).
    """
    if not texto:
        return None, ""
    original = texto.strip()
    t = original.upper().replace("\xa0", " ")
    es_uf = "UF" in t
    # quita todo lo que no sea dígito, coma o punto
    num = re.sub(r"[^\d.,]", "", t)
    if not num:
        return None, original
    if es_uf:
        # UF usa coma decimal: "13,5"
        num = num.replace(".", "").replace(",", ".")
        try:
            val = float(num) * uf_to_clp()
            return int(round(val)), original
        except ValueError:
            return None, original
    else:
        # CLP: puntos son separador de miles
        num = num.replace(".", "").replace(",", "")
        try:
            return int(num), original
        except ValueError:
            return None, original


def parse_int(texto: str) -> Optional[int]:
    m = re.search(r"\d+", texto or "")
    return int(m.group()) if m else None


def parse_float(texto: str) -> Optional[float]:
    m = re.search(r"\d+[.,]?\d*", (texto or "").replace(".", "").replace(",", "."))
    if not m:
        m = re.search(r"\d+", texto or "")
    try:
        return float(m.group().replace(",", ".")) if m else None
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Guardado de resultados por fuente
# ---------------------------------------------------------------------------
def guardar(fuente: str, listings: list[Listing]):
    os.makedirs(config.RAW_DIR, exist_ok=True)
    path = os.path.join(config.RAW_DIR, f"{fuente}.json")
    data = [asdict(x) for x in listings]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log(f"✔ {fuente}: {len(listings)} propiedades guardadas en {path}")
    return path
