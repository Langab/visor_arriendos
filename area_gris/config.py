"""
Configuración del visor ÁREA GRIS.

Variante del visor principal para UNA persona que quiere vivir sola:
departamento (studio o 1 dormitorio sirve), SIN amoblar, SIN estacionamiento,
SIN bodega, con tope de $350.000 TOTAL (arriendo + gastos comunes), en los
mismos barrios del visor principal.

El pipeline completo se comparte con la raíz del proyecto (../scrapers,
../consolidate.py, ../geocode.py, ../metro.py, ../snapshots.py, ../enrich_pi.py):
run_all.py de esta carpeta lo importa con ESTE config, así todas las salidas
(data/, viewer/data.js, snapshots) quedan dentro de area_gris/.
"""

# ---------------------------------------------------------------------------
# Criterios de búsqueda (los de Área Gris)
# ---------------------------------------------------------------------------

# Mismas comunas y barrios que el visor principal.
COMUNAS = ["providencia", "santiago", "nunoa"]

BARRIOS_OBJETIVO = [
    "Parque Bustamante",
    "Lastarria",
    "José Victorino Lastarria",
    "Bellas Artes",
    "Salvador",
    "Barrio Italia",
    "Manuel Montt",
    "Pedro de Valdivia",   # entorno Metro Pedro de Valdivia
    "Los Leones",          # entorno Metro Los Leones
    "Bustamante",
    "Providencia",
    "Santa Isabel",
    "Condell",
]

# (n/a en esta búsqueda: vive una persona, no se necesita 2D amplio)
SUPERFICIE_MIN_2D_M2 = 999

# Presupuesto máximo TOTAL en pesos chilenos (arriendo + gastos comunes).
PRESUPUESTO_MAX_CLP = 350_000

# Tope del scraping (margen sobre el presupuesto: los GC se suman después y
# a veces el precio publicado baja al negociar).
PRECIO_MAX_SCRAPE_CLP = 400_000

# Avisos con arriendo sobre esto se descartan al consolidar (muy fuera de
# rango para esta búsqueda; aliviana el visor y el análisis).
PRECIO_DESCARTE_CLP = 600_000

# Dormitorios: studios (0 / sin dato) también sirven; 1 dormitorio es lo ideal.
DORMITORIOS_MIN = 0
DORMITORIOS_OBJETIVO = 1

# Estimación de gastos comunes cuando el aviso no los publica (CLP).
# Para studios / 1 dormitorio son bastante más bajos que en deptos grandes.
GASTOS_COMUNES_ESTIMADO_CLP = 70_000

# ---------------------------------------------------------------------------
# Conversión UF -> CLP
# ---------------------------------------------------------------------------
UF_TO_CLP_FALLBACK = 39_500

# ---------------------------------------------------------------------------
# Scraping (idéntico al visor principal)
# ---------------------------------------------------------------------------
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 25
PAUSA_ENTRE_REQUESTS = 1.5
MAX_PAGINAS_POR_COMUNA = 5
MAX_PAGINAS_POR_BARRIO = 8

# Búsqueda por BARRIO en Portal Inmobiliario (mismos slugs del visor principal).
BARRIOS_PI = [
    ("barrio-lastarria-santiago-santiago-metropolitana", "santiago"),
    ("santa-isabel-santiago-santiago-metropolitana", "santiago"),
    ("barrio-italia-providencia-santiago-metropolitana", "providencia"),
    ("pedro-de-valdivia-providencia-santiago-metropolitana", "providencia"),
    ("los-leones-providencia-santiago-metropolitana", "providencia"),
    ("manuel-montt-providencia-santiago-metropolitana", "providencia"),
    ("salvador-providencia-santiago-metropolitana", "providencia"),
]

# ---------------------------------------------------------------------------
# Rutas (todo dentro de area_gris/)
# ---------------------------------------------------------------------------
import os
import re as _re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
GEOCODE_CACHE = os.path.join(DATA_DIR, "geocode_cache.json")
MASTER_JSON = os.path.join(DATA_DIR, "master.json")
MASTER_CSV = os.path.join(DATA_DIR, "master.csv")
VIEWER_DATA_JS = os.path.join(BASE_DIR, "viewer", "data.js")
HISTORIA_DIR = os.path.join(BASE_DIR, "viewer", "historia")
HISTORIA_MAX_DIAS = 30

# ---------------------------------------------------------------------------
# Hook de match ÁREA GRIS (consolidate.py lo llama por cada aviso)
# ---------------------------------------------------------------------------
# Detección de amoblado / estacionamiento / bodega. La fuente más confiable es
# la ficha de detalle (enrich_pi: campos amoblado, estacionamientos, bodegas);
# si no hay dato, se detecta por palabras del título. Los avisos amoblados casi
# siempre lo anuncian, así que "sin dato" se asume SIN amoblar.
_RE_NO_AMOBLADO = _re.compile(r"sin\s+amoblar|sin\s+muebles|no\s+amoblado", _re.I)
_RE_AMOBLADO = _re.compile(r"amoblad|furnished", _re.I)
_RE_NO_ESTAC = _re.compile(r"sin\s+estacionamiento", _re.I)
_RE_ESTAC = _re.compile(r"estacionamiento|\bparking\b", _re.I)
_RE_NO_BODEGA = _re.compile(r"sin\s+bodega", _re.I)
_RE_BODEGA = _re.compile(r"\bbodega", _re.I)


def AJUSTAR_LISTING(l: dict) -> None:
    """Match Área Gris: ≤ $350.000 total · barrio objetivo · sin amoblar ·
    sin estacionamiento · sin bodega. Redefine match_perfecto y relevancia."""
    txt = f"{l.get('titulo', '')} {l.get('direccion', '')}"

    amob = l.get("amoblado")            # dato real de la ficha, si existe
    if amob is None:
        if _RE_NO_AMOBLADO.search(txt):
            amob = False
        elif _RE_AMOBLADO.search(txt):
            amob = True
    l["amoblado"] = amob                # True / False / None = sin dato

    estac = (l.get("estacionamientos") or 0) > 0
    if not estac and _RE_ESTAC.search(txt) and not _RE_NO_ESTAC.search(txt):
        estac = True
    l["tiene_estacionamiento"] = estac

    bod = (l.get("bodegas") or 0) > 0
    if not bod and _RE_BODEGA.search(txt) and not _RE_NO_BODEGA.search(txt):
        bod = True
    l["tiene_bodega"] = bod

    # "limpio" = sin amoblar (o sin dato), sin estacionamiento y sin bodega
    l["sin_extras"] = (amob is not True) and not estac and not bod

    # formato para vivir solo: studio (0 / sin dato) o 1 dormitorio
    dorm = l.get("dormitorios")
    l["formato_1p"] = dorm is None or dorm <= 1

    l["match_perfecto"] = bool(
        l.get("dentro_presupuesto") and l.get("en_barrio_objetivo") and l["sin_extras"]
    )

    score = 0
    if l.get("dentro_presupuesto"):
        score += 40
    if l.get("en_barrio_objetivo"):
        score += 25
    if l["sin_extras"]:
        score += 15
    if l["formato_1p"]:
        score += 10
    if l.get("metro_dist_m") is not None and l["metro_dist_m"] <= 500:
        score += 5
    if l["match_perfecto"]:
        score += 10
    l["relevancia"] = score
