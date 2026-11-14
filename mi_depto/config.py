"""
Configuración del visor MI DEPTO (la búsqueda propia de Benjamín).

Lo pedido (14-11-2026):
    «en los mismos barrios que hemos visto en los otros visores, idealmente
     Lastarria o Diagonal Paraguay, en los que pague 600 máximo con gastos
     comunes»

Traducido a criterios:
  - tope $600.000 TOTAL (arriendo + gastos comunes)
  - mismos barrios de los otros visores (Lastarria, Bellas Artes, Santa
    Isabel, San Borja, Portugal, Parque Bustamante, Barrio Italia, Salvador,
    Manuel Montt, Pedro de Valdivia, Los Leones…)
  - lo ideal: cerca de calle Lastarria o de Diagonal Paraguay (distancia en
    línea recta a esos dos trazados de OpenStreetMap)
  - no se pidió número de dormitorios ni amoblado: no se filtra por eso
    (el visor tiene los filtros a mano)

Match  = ≤ $600.000 total y a ≤ 600 m de Lastarria o Diagonal Paraguay.
Plan B = ≤ $600.000 total, en otro de los barrios de siempre.

El pipeline completo se comparte con la raíz del proyecto (../scrapers,
../consolidate.py, etc.): run_all.py de esta carpeta lo importa con ESTE
config y todas las salidas quedan dentro de mi_depto/.
"""
import math as _math
import os

# ---------------------------------------------------------------------------
# Criterios de búsqueda
# ---------------------------------------------------------------------------
COMUNAS = ["providencia", "santiago", "nunoa"]

BARRIOS_OBJETIVO = [
    "Lastarria",
    "José Victorino Lastarria",
    "Diagonal Paraguay",
    "Paraguay",
    "Bellas Artes",
    "Santa Lucía",
    "San Borja",
    "Portugal",
    "Santa Isabel",
    "Parque Bustamante",
    "Bustamante",
    "Barrio Italia",
    "Salvador",
    "Manuel Montt",
    "Pedro de Valdivia",
    "Los Leones",
    "Providencia",
    "Condell",
]

# (no aplica: el formato no es criterio en esta búsqueda)
SUPERFICIE_MIN_2D_M2 = 999

PRESUPUESTO_MAX_CLP = 600_000

# Margen sobre el tope (los GC se suman después y el precio se negocia).
PRECIO_MAX_SCRAPE_CLP = 650_000

# Arriendos sobre esto se descartan al consolidar (aliviana el visor).
PRECIO_DESCARTE_CLP = 800_000

DORMITORIOS_MIN = 0
DORMITORIOS_OBJETIVO = 1

# Gastos comunes estimados cuando el aviso no los publica (1–2D en la zona).
GASTOS_COMUNES_ESTIMADO_CLP = 90_000

# ---------------------------------------------------------------------------
# Zona ideal: calle Lastarria y Diagonal Paraguay
# ---------------------------------------------------------------------------
# Trazados de OpenStreetMap (Overpass, 14-11-2026). Lastarria desde la
# Alameda (Metro U. Católica) hasta el Parque Forestal; Diagonal Paraguay
# desde Santa Rosa hasta Vicuña Mackenna (borde de Plaza Italia).
ZONA_IDEAL = {
    "Lastarria": [
        (-33.44021, -70.64068), (-33.43981, -70.64117), (-33.43947, -70.64119),
        (-33.43902, -70.64115), (-33.43823, -70.64108), (-33.43751, -70.64100),
        (-33.43715, -70.64108),
    ],
    "Diagonal Paraguay": [
        (-33.44226, -70.64391), (-33.44244, -70.64305), (-33.44267, -70.64246),
        (-33.44285, -70.64170), (-33.44300, -70.64101), (-33.44326, -70.63904),
        (-33.44278, -70.63699), (-33.44192, -70.63410), (-33.44184, -70.63382),
    ],
}
ZONA_IDEAL_M = 600      # "en la zona": unas 5–6 cuadras de radio
ZONA_CERCA_M = 1200     # "cerca": unos 15 minutos caminando

META_EXTRA = {
    "zona_ideal": {k: [list(p) for p in v] for k, v in ZONA_IDEAL.items()},
    "zona_ideal_m": ZONA_IDEAL_M,
    "zona_cerca_m": ZONA_CERCA_M,
}

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
# Rutas (todo dentro de mi_depto/)
# ---------------------------------------------------------------------------
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
# Hook de match (consolidate.py lo llama por cada aviso)
# ---------------------------------------------------------------------------
def _dist_segmento_m(lat, lng, a, b) -> float:
    """Distancia en metros de un punto a un segmento (proyección local)."""
    k = 111_320.0
    kx = k * _math.cos(_math.radians(lat))
    ax, ay = (a[1] - lng) * kx, (a[0] - lat) * k
    bx, by = (b[1] - lng) * kx, (b[0] - lat) * k
    dx, dy = bx - ax, by - ay
    largo2 = dx * dx + dy * dy
    t = 0.0 if largo2 == 0 else max(0.0, min(1.0, (-ax * dx - ay * dy) / largo2))
    return _math.hypot(ax + t * dx, ay + t * dy)


def distancia_zona_ideal(lat, lng):
    """(nombre de la referencia más cercana, metros) o (None, None)."""
    if lat is None or lng is None:
        return None, None
    mejor = (None, None)
    for nombre, puntos in ZONA_IDEAL.items():
        for a, b in zip(puntos, puntos[1:]):
            d = _dist_segmento_m(lat, lng, a, b)
            if mejor[1] is None or d < mejor[1]:
                mejor = (nombre, d)
    return mejor[0], int(round(mejor[1]))


def AJUSTAR_LISTING(l: dict) -> None:
    """Match: ≤ $600.000 total y a ≤ 600 m de Lastarria o Diagonal Paraguay.
    Plan B: ≤ $600.000 total en otro barrio de siempre."""
    ref, dist = distancia_zona_ideal(l.get("lat"), l.get("lng"))
    if l.get("ubicacion_aprox"):
        ref, dist = None, None      # pin en el centro de la comuna: no sirve
    l["zona_ref"] = ref
    l["zona_dist_m"] = dist
    l["zona_ideal"] = dist is not None and dist <= ZONA_IDEAL_M
    l["zona_cerca"] = dist is not None and dist <= ZONA_CERCA_M
    l["en_sector"] = bool(l.get("en_barrio_objetivo") or l["zona_cerca"])

    # precio «desde» de un edificio con varias tipologías: se avisa en la tarjeta
    l["tipologias_dudosas"] = bool(l.get("rango_tipologias"))

    pres = bool(l.get("dentro_presupuesto"))
    l["match_perfecto"] = pres and l["zona_ideal"]
    l["plan_b"] = pres and not l["zona_ideal"] and l["en_sector"]

    score = 0
    if pres:
        score += 45
    if l["zona_ideal"]:
        score += 30
        if dist <= 300:
            score += 5
    elif l["zona_cerca"]:
        score += 18
    elif l.get("en_barrio_objetivo"):
        score += 12
    if l.get("metro_dist_m") is not None and l["metro_dist_m"] <= 500:
        score += 5
    if l.get("dormitorios") and l["dormitorios"] >= 1:
        score += 5
    if l["match_perfecto"]:
        score += 10
    l["relevancia"] = min(score, 100)
