"""
Geocodificación de direcciones a lat/lng usando Nominatim (OpenStreetMap).

- Gratuito, sin API key.
- Respeta el límite de 1 request/segundo de Nominatim.
- Cachea resultados en data/geocode_cache.json para no repetir consultas
  (re-ejecutar el pipeline no vuelve a geocodificar lo ya conocido).
"""
from __future__ import annotations

import json
import os
import re
import time

import requests

import config

NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "visor-arriendos-santiago/1.0 (uso personal)"}

# Caja delimitadora aproximada de Santiago centro/oriente para acotar resultados.
VIEWBOX = "-70.68,-33.40,-70.55,-33.47"  # left,top,right,bottom

# Centroides de comuna: fallback cuando la dirección exacta no geocodifica,
# para que TODA propiedad aparezca al menos aproximada en el mapa.
COMUNA_CENTROIDES = {
    "providencia": (-33.4255, -70.6100),
    "santiago":    (-33.4450, -70.6500),
    "ñuñoa":       (-33.4560, -70.5980),
    "nunoa":       (-33.4560, -70.5980),
}

# Centroides por BARRIO: fallback más preciso que la comuna cuando la dirección
# no geocodifica pero sí menciona un barrio conocido (ej. "Barrio Lastarria").
BARRIO_CENTROIDES = {
    "lastarria": (-33.4375, -70.6403),
    "jose victorino lastarria": (-33.4375, -70.6403),
    "bellas artes": (-33.4360, -70.6415),
    "barrio italia": (-33.4470, -70.6250),
    "parque bustamante": (-33.4440, -70.6308),
    "bustamante": (-33.4440, -70.6308),
    "salvador": (-33.4267, -70.6281),
    "manuel montt": (-33.4290, -70.6180),
    "pedro de valdivia": (-33.4262, -70.6110),
    "los leones": (-33.4220, -70.6035),
    "santa isabel": (-33.4495, -70.6305),
    "condell": (-33.4460, -70.6285),
}


def _sin_tildes(s: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _barrio_centroide(texto: str):
    """Si el texto menciona un barrio conocido, devuelve su centroide."""
    t = _sin_tildes(texto)
    for barrio, coord in BARRIO_CENTROIDES.items():
        if barrio in t:
            return coord
    return None


def _norm_comuna(c: str) -> str:
    return (c or "").lower().replace("ñ", "n").strip()


def _cargar_cache() -> dict:
    if os.path.exists(config.GEOCODE_CACHE):
        try:
            with open(config.GEOCODE_CACHE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _guardar_cache(cache: dict):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.GEOCODE_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def _consulta(direccion: str) -> tuple[float, float] | None:
    params = {
        "q": direccion,
        "format": "json",
        "limit": 1,
        "countrycodes": "cl",
        "viewbox": VIEWBOX,
        "bounded": 0,
    }
    try:
        r = requests.get(NOMINATIM, params=params, headers=HEADERS, timeout=20)
        if r.ok and r.json():
            d = r.json()[0]
            return float(d["lat"]), float(d["lon"])
    except Exception:
        pass
    return None


def _limpiar_direccion(direccion: str, comuna: str) -> str:
    """
    La dirección de PI viene como 'Calle 123, Barrio, Comuna, Ref, Comuna'.
    Nos quedamos con la primera parte (calle+número) + comuna + Santiago, Chile.
    Quita rangos de numeración ('600 - 900' -> '600') que confunden a Nominatim.
    """
    primera = direccion.split(",")[0].strip()
    # intersecciones: "X CON Y", "X ESQ Y", "X / Y" -> nos quedamos con la calle X
    primera = re.split(r"\s+(?:con|esq\.?|esquina|c/|/)\s+", primera, flags=re.I)[0].strip()
    primera = re.sub(r"\s*-\s*\d+", "", primera)   # "Los Leones 600 - 900" -> "Los Leones 600"
    com = comuna or "Santiago"
    return f"{primera}, {com}, Región Metropolitana, Chile"


def geocodificar(listings: list[dict]) -> list[dict]:
    """
    Agrega lat/lng a cada listing (dict) que tenga dirección y aún no tenga
    coordenadas. Modifica y devuelve la misma lista.
    """
    cache = _cargar_cache()
    pendientes = [l for l in listings if not l.get("lat") and l.get("direccion")]
    print(f"Geocodificando {len(pendientes)} direcciones "
          f"({len(listings) - len(pendientes)} ya tienen coordenadas)...")

    nuevas = 0
    for i, l in enumerate(pendientes, 1):
        q = _limpiar_direccion(l["direccion"], l.get("comuna", ""))
        if q in cache:                        # reusa cache (éxito o fallo previo)
            coords = cache[q]                 # borra geocode_cache.json para reintentar fallos
        else:
            coords = _consulta(q)
            cache[q] = coords
            time.sleep(1.15)                  # límite Nominatim (1 req/seg)
            nuevas += 1
            if nuevas % 15 == 0:
                _guardar_cache(cache)
                print(f"  ...{i}/{len(pendientes)} ({sum(1 for x in listings if x.get('lat'))} mapeados)",
                      flush=True)
        if coords:
            l["lat"], l["lng"] = coords[0], coords[1]
            l["ubicacion_aprox"] = False

    # Fallback: lo que no geocodificó cae al centro de su BARRIO (si menciona uno
    # conocido) o, si no, al centro de su comuna. Siempre marcado como aproximado.
    aprox = 0
    for l in listings:
        if not l.get("lat"):
            cen = _barrio_centroide(f"{l.get('direccion','')} {l.get('barrio','')}") \
                or COMUNA_CENTROIDES.get(_norm_comuna(l.get("comuna", "")))
            if cen:
                # pequeño desplazamiento determinístico para que no se apilen
                h = int(l.get("id", "0")[:6] or "0", 16)
                l["lat"] = cen[0] + ((h % 100) - 50) / 8000.0
                l["lng"] = cen[1] + ((h // 100 % 100) - 50) / 8000.0
                l["ubicacion_aprox"] = True
                aprox += 1

    _guardar_cache(cache)
    exactas = sum(1 for l in listings if l.get("lat") and not l.get("ubicacion_aprox"))
    print(f"Geocodificación lista: {exactas} exactas + {aprox} aproximadas (centro de comuna) "
          f"de {len(listings)} · {nuevas} consultas nuevas.")
    return listings


if __name__ == "__main__":
    # Permite geocodificar el master ya generado de forma independiente.
    with open(config.MASTER_JSON, encoding="utf-8") as f:
        data = json.load(f)
    geocodificar(data)
    with open(config.MASTER_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
