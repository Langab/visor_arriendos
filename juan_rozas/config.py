"""
Configuración del visor JUAN ROZAS · "El Frío Misterio de los Arriendos".

Variante del visor principal para Juan Rozas: vive UNA persona, busca
departamento de DOS piezas (2 dormitorios) con UN baño, en los mismos barrios
del visor principal, con tope de $700.000 TOTAL (arriendo + gastos comunes).

El pipeline completo se comparte con la raíz del proyecto (../scrapers,
../consolidate.py, ../geocode.py, ../metro.py, ../snapshots.py, ../enrich_pi.py):
run_all.py de esta carpeta lo importa con ESTE config, así todas las salidas
(data/, viewer/data.js, snapshots) quedan dentro de juan_rozas/.
"""

# ---------------------------------------------------------------------------
# Criterios de búsqueda (los de Juan Rozas)
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

# (n/a en esta búsqueda: el match se define por 2D/1B, no por un 2D "amplio")
SUPERFICIE_MIN_2D_M2 = 999

# Presupuesto máximo TOTAL en pesos chilenos (arriendo + gastos comunes).
PRESUPUESTO_MAX_CLP = 700_000

# Tope del scraping (margen sobre el presupuesto: los GC se suman después y
# a veces el precio publicado baja al negociar).
PRECIO_MAX_SCRAPE_CLP = 780_000

# Avisos con arriendo sobre esto se descartan al consolidar (muy fuera de
# rango para esta búsqueda; aliviana el visor y el análisis).
PRECIO_DESCARTE_CLP = 1_000_000

# Dormitorios: lo buscado son 2 piezas justas (el hook de match lo exige).
DORMITORIOS_MIN = 2
DORMITORIOS_OBJETIVO = 2

# Estimación de gastos comunes cuando el aviso no los publica (CLP).
# Para un 2D en estas comunas quedan entre los studios (~70k) y los 3D (~120k).
GASTOS_COMUNES_ESTIMADO_CLP = 100_000

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
# Más profundo que los otros visores: Chilepropiedades se corta solo cuando
# se acaban los avisos, y con PI a veces bloqueado conviene exprimir las
# fuentes que sí responden. (También profundiza PI cuando está disponible.)
MAX_PAGINAS_POR_COMUNA = 15
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
# Rutas (todo dentro de juan_rozas/)
# ---------------------------------------------------------------------------
import os

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
# Hook de match JUAN ROZAS (consolidate.py lo llama por cada aviso)
# ---------------------------------------------------------------------------
# match = total ≤ $700.000 · 2 dormitorios · 1 baño · en barrio objetivo.
# Baños sin dato se asumen 1 (en este rango de precio los 2D con 2 baños casi
# siempre lo publican; el dato real llega igual con --enrich).


def AJUSTAR_LISTING(l: dict) -> None:
    """Match Juan Rozas: ≤ $700.000 total · 2D · 1B · barrio objetivo.
    Redefine match_perfecto y relevancia."""
    dorm = l.get("dormitorios")
    ban = l.get("banos")

    l["formato_2d"] = dorm == 2                 # dos piezas justas
    l["bano_unico"] = ban is None or ban == 1   # un baño (sin dato se asume 1)

    l["match_perfecto"] = bool(
        l.get("dentro_presupuesto") and l.get("en_barrio_objetivo")
        and l["formato_2d"] and l["bano_unico"]
    )

    score = 0
    if l.get("dentro_presupuesto"):
        score += 40
    if l["formato_2d"]:
        score += 25
    elif dorm is not None and dorm >= 2:
        score += 10
    if l["bano_unico"]:
        score += 10
    if l.get("en_barrio_objetivo"):
        score += 15
    if l.get("metro_dist_m") is not None and l["metro_dist_m"] <= 500:
        score += 5
    if l["match_perfecto"]:
        score += 5
    l["relevancia"] = score
