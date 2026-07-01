"""
Configuración central del proyecto Visor de Arriendos.
Edita aquí tus criterios de búsqueda; todos los scrapers y el consolidador lo leen.
"""

# ---------------------------------------------------------------------------
# Criterios de búsqueda
# ---------------------------------------------------------------------------

# Comunas objetivo (cubren el eje Parque Bustamante / Lastarria / Salvador /
# Barrio Italia / Manuel Montt, que cae entre Providencia, Santiago y Ñuñoa).
COMUNAS = ["providencia", "santiago", "nunoa"]

# Barrios / referencias que nos interesan (se usan para puntuar relevancia
# y para los filtros del visor).
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

# Un 2 dormitorios amplio (con espacio para oficina) también nos sirve: si tiene
# al menos esta superficie útil, cuenta como "match" aunque sea 2D.
SUPERFICIE_MIN_2D_M2 = 68

# Presupuesto máximo TOTAL en pesos chilenos (arriendo + gastos comunes).
PRESUPUESTO_MAX_CLP = 800_000

# Para acotar el scraping (dejamos margen sobre el tope porque los gastos
# comunes se suman después y porque a veces el precio publicado baja al negociar).
PRECIO_MAX_SCRAPE_CLP = 850_000

# Dormitorios deseados (el visor filtra; scrapeamos amplio para no perder data).
DORMITORIOS_MIN = 2          # mínimo que queremos ver en el visor
DORMITORIOS_OBJETIVO = 3     # lo ideal: 2 grandes + 1 oficina

# Estimación de gastos comunes cuando el aviso no los publica (CLP).
# Se usa solo para el cálculo del "total estimado" en el visor; es editable ahí.
GASTOS_COMUNES_ESTIMADO_CLP = 120_000

# ---------------------------------------------------------------------------
# Conversión UF -> CLP
# ---------------------------------------------------------------------------
# Muchos avisos publican el arriendo en UF. Intentamos el valor en vivo desde
# mindicador.cl; si falla, usamos este fallback. Actualízalo si es necesario.
UF_TO_CLP_FALLBACK = 39_500

# ---------------------------------------------------------------------------
# Scraping
# ---------------------------------------------------------------------------
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 25          # segundos por request
PAUSA_ENTRE_REQUESTS = 1.5    # segundos (cortesía / anti-bloqueo)
MAX_PAGINAS_POR_COMUNA = 5    # páginas por comuna (red amplia)
MAX_PAGINAS_POR_BARRIO = 8    # páginas por barrio objetivo (cobertura fina)

# Búsqueda por BARRIO en Portal Inmobiliario (slugs de sus facetas de ubicación).
# La búsqueda por comuna sola se queda en las primeras páginas y pierde el resto;
# buscar por barrio garantiza cubrir TODA tu zona. (slug, comuna)
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
# Rutas
# ---------------------------------------------------------------------------
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
GEOCODE_CACHE = os.path.join(DATA_DIR, "geocode_cache.json")
MASTER_JSON = os.path.join(DATA_DIR, "master.json")
MASTER_CSV = os.path.join(DATA_DIR, "master.csv")
VIEWER_DATA_JS = os.path.join(BASE_DIR, "viewer", "data.js")
HISTORIA_DIR = os.path.join(BASE_DIR, "viewer", "historia")  # fotos completas por fecha
HISTORIA_MAX_DIAS = 30  # cuántas fotos completas conservar para el visor
