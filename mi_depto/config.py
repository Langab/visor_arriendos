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
  - (14-11-2026, después) «quiero que tenga living y dos piezas» → 2
    dormitorios o más. El living no viene como dato en los portales: todo
    depto de 2D lo tiene salvo rarezas (loft, «2 ambientes»), así que se
    exige 2D y se avisa en la tarjeta si el título dice loft/sin living.
  - amoblado: no se pidió, no se filtra (el visor tiene el filtro a mano)

Match  = 2+ dormitorios, ≤ $600.000 total y a ≤ 600 m de Lastarria o
         Diagonal Paraguay.
Plan B = 2+ dormitorios, ≤ $600.000 total, en otro de los barrios de siempre.

El pipeline completo se comparte con la raíz del proyecto (../scrapers,
../consolidate.py, etc.): run_all.py de esta carpeta lo importa con ESTE
config y todas las salidas quedan dentro de mi_depto/.
"""
import math as _math
import os
import re as _re

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

DORMITORIOS_MIN = 2          # living + dos piezas
DORMITORIOS_OBJETIVO = 2

# Gastos comunes estimados cuando el aviso no los publica (2D en la zona).
GASTOS_COMUNES_ESTIMADO_CLP = 100_000

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


_RE_SIN_LIVING = _re.compile(r"\bloft\b|sin\s+living|2\s+ambientes", _re.I)
# el título contradice los dormitorios del portal ("2D" con título "1d 1b")
_RE_TITULO_1D = _re.compile(r"\b1\s*d\b|\b1\s*dorm|\b1\s*hab|\bestudio\b|\bstudio\b", _re.I)


def AJUSTAR_LISTING(l: dict) -> None:
    """Match: 2+ dormitorios, ≤ $600.000 total y a ≤ 600 m de Lastarria o
    Diagonal Paraguay. Plan B: lo mismo en otro barrio de siempre.

    «Parecido al ejemplo» (el que mandó como referencia: Ismael Valdés
    Vergara 514 — 2D, 2B, 50 m², $470.000 + GC $60.000, frente a Bellas
    Artes): match con 2+ baños y 45 m² o más."""
    ref, dist = distancia_zona_ideal(l.get("lat"), l.get("lng"))
    if l.get("ubicacion_aprox"):
        ref, dist = None, None      # pin en el centro de la comuna: no sirve
    l["zona_ref"] = ref
    l["zona_dist_m"] = dist
    l["zona_ideal"] = dist is not None and dist <= ZONA_IDEAL_M
    l["zona_cerca"] = dist is not None and dist <= ZONA_CERCA_M
    l["en_sector"] = bool(l.get("en_barrio_objetivo") or l["zona_cerca"])

    # Edificios de renta con varias tipologías ("1 a 3 dormitorios, desde $X"):
    # el precio publicado es el de la unidad más chica, así que cuenta esa.
    dorm = l.get("dormitorios")
    if l.get("rango_tipologias"):
        dorm = l.get("dormitorios_min", dorm)
    # un 2D en menos de 30 m² no existe: es el "desde" de un edificio con studios
    sup = l.get("superficie_m2")
    raro = bool(sup and dorm == 2 and sup < 30)
    if dorm is not None and dorm >= 2 and _RE_TITULO_1D.search(l.get("titulo") or ""):
        raro = True
    l["tipologias_dudosas"] = raro or bool(l.get("rango_tipologias") and dorm != l.get("dormitorios"))

    l["sin_living"] = bool(_RE_SIN_LIVING.search(l.get("titulo") or ""))
    l["dos_piezas"] = (not l["tipologias_dudosas"] and dorm is not None
                       and dorm >= DORMITORIOS_MIN and not l["sin_living"])

    pres = bool(l.get("dentro_presupuesto"))
    base = pres and l["dos_piezas"]
    l["match_perfecto"] = base and l["zona_ideal"]
    l["plan_b"] = base and not l["zona_ideal"] and l["en_sector"]

    banos2 = not l["tipologias_dudosas"] and (l.get("banos") or 0) >= 2
    grande = (sup or 0) >= 45
    l["parecido_ejemplo"] = bool(l["match_perfecto"] and banos2 and grande)

    score = 0
    if pres:
        score += 35
    if l["dos_piezas"]:
        score += 30
    if l["zona_ideal"]:
        score += 20
        if dist <= 300:
            score += 4
    elif l["zona_cerca"]:
        score += 12
    elif l.get("en_barrio_objetivo"):
        score += 8
    if l.get("metro_dist_m") is not None and l["metro_dist_m"] <= 500:
        score += 3
    if banos2:
        score += 3
    if grande:
        score += 3
    if l["match_perfecto"]:
        score += 8
    l["relevancia"] = min(score, 100)
