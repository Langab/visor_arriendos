"""
Scraper de Portal Inmobiliario (portalinmobiliario.com).

Es la fuente principal: agrega el real estate de MercadoLibre Chile y entrega
direcciones completas (geocodificables), precio, dormitorios, baños, m² y plazo
de entrega directamente en la página de resultados (HTML estático, sin JS).

Uso:
    python scrapers/portalinmobiliario.py        # corre y guarda data/raw/portalinmobiliario.json
"""
from __future__ import annotations

import os
import re
import time

from bs4 import BeautifulSoup

import base
from base import Listing, get, log, parse_precio, parse_int, parse_float
import config

FUENTE = "portalinmobiliario"
BASE_URL = "https://www.portalinmobiliario.com"

# PI (MercadoLibre) empezó a mandar los `requests` a un muro anti-bot
# ("/gz/account-verification" o una página de challenge con redirect por JS).
# Cuando eso pasa, el resto de la corrida se hace con Scrapling/Camoufox
# (mismo navegador sigiloso que usa yapo.py): más lento, pero pasa.
_USAR_SCRAPLING = False


def _es_muro(r) -> bool:
    """¿La respuesta es el muro anti-bot y no la página de resultados?"""
    if "account-verification" in (r.url or ""):
        return True
    # challenge liviano: página chica con script que redirige solo
    return len(r.text) < 30_000 and "poly-card" not in r.text


def _html_scrapling(url: str) -> str | None:
    """Página de resultados vía Camoufox. El challenge de ML corre su JS y
    redirige a los ~3 s, así que esperamos a que aparezcan las tarjetas
    (wait_selector) en vez de confiar en network_idle.

    Claves para que ML no nos cuelgue en páginas sucesivas:
    - Perfil PERSISTENTE (user_data_dir): la cookie de bypass del challenge
      dura ~5 min y se reutiliza entre páginas → el challenge se resuelve una
      vez por tanda, no en cada página.
    - El selector también acepta la página "sin resultados" (rescue) para que
      el final de una sección no parezca un timeout.
    """
    from scrapling.fetchers import StealthyFetcher
    perfil = os.path.join(config.DATA_DIR, "camoufox_profile")
    for intento in (1, 2):
        try:
            page = StealthyFetcher.fetch(
                url, headless=True, disable_resources=True,
                timeout=100_000,
                wait_selector="a.poly-component__title, [class*=rescue]",
                wait=800, user_data_dir=perfil,
            )
            html = page.html_content if hasattr(page, "html_content") else str(page.body)
            time.sleep(2.5)  # cortesía extra: ML rate-limitea si lo apuramos
            return html
        except Exception as e:
            log(f"  Scrapling intento {intento}: {e.__class__.__name__}: {str(e)[:70]}")
            # un challenge colgado suele soltarse al reintentar con la cookie
            # ya puesta; si el 2º intento también falla, la sección se corta
    return None


def _obtener_html(url: str) -> str | None:
    """HTML de resultados: requests primero (rápido); si aparece el muro
    anti-bot, cambia a Scrapling para lo que queda de la corrida."""
    global _USAR_SCRAPLING
    if not _USAR_SCRAPLING:
        r = get(url)
        if r is not None and not _es_muro(r):
            return r.text
        log("  ⚠ PI bloqueó requests (muro anti-bot) → sigo con Scrapling/Camoufox")
        _USAR_SCRAPLING = True
    return _html_scrapling(url)


def _url_paginada(seccion: str, desde: int) -> str:
    """
    URL de resultados para una 'sección' (comuna o barrio) y un offset.
    'seccion' es el segmento de ubicación (ej. 'santiago-metropolitana' o el slug
    de barrio). PI pagina con el sufijo _Desde_<n> (49 por página).
    """
    precio = f"_PriceRange_0CLP-{config.PRECIO_MAX_SCRAPE_CLP}CLP"
    base_path = f"{BASE_URL}/arriendo/departamento/{seccion}/{precio}"
    if desde > 1:
        base_path += f"_Desde_{desde}"
    return base_path


def _texto(el):
    return el.get_text(" ", strip=True) if el else ""


def _parse_card(card, comuna: str) -> Listing | None:
    a = card.select_one("a.poly-component__title")
    if not a or not a.get("href"):
        return None
    url = a["href"].split("#")[0]

    # Precio (puede venir en UF o en $)
    cur = card.select_one(".andes-money-amount__currency-symbol")
    frac = card.select_one(".poly-component__price .andes-money-amount__fraction, "
                           ".andes-money-amount__fraction")
    precio_txt = f"{_texto(cur)} {_texto(frac)}".strip()
    precio_clp, precio_original = parse_precio(precio_txt)

    # Atributos: "2 dormitorios", "2 baños", "65 m² útiles"
    dorms = banos = None
    sup = None
    for it in card.select(".poly-attributes_list__item"):
        t = _texto(it).lower()
        if "dormitorio" in t:
            # "1 a 2 dormitorios" -> tomamos el mayor del rango como referencia
            nums = re.findall(r"\d+", t)
            dorms = int(nums[-1]) if nums else dorms
        elif "baño" in t or "bano" in t:
            nums = re.findall(r"\d+", t)
            banos = int(nums[-1]) if nums else banos
        elif "m²" in t or "m2" in t:
            sup = parse_float(t)

    direccion = _texto(card.select_one(".poly-component__location"))
    plazo = _texto(card.select_one(".poly-component__possession-date"))

    # Imagen (lazy load: a veces en data-src)
    img_el = card.select_one(".poly-component__picture img, img.poly-component__picture")
    imagen = ""
    if img_el:
        imagen = img_el.get("data-src") or img_el.get("src") or ""
        if imagen.startswith("data:"):
            imagen = img_el.get("data-src") or ""

    lst = Listing(
        fuente=FUENTE,
        url=url,
        titulo=_texto(a)[:160],
        precio_clp=precio_clp,
        precio_original=precio_original,
        dormitorios=dorms,
        banos=banos,
        superficie_m2=sup,
        direccion=direccion,
        comuna=comuna.replace("nunoa", "ñuñoa").title(),
        plazo_entrega=plazo,
        imagen=imagen,
        corredor=None,  # PI no distingue claramente en el listado
        extraido_en=time.strftime("%Y-%m-%dT%H:%M:%S"),
    )
    return lst.fill_id()


def _recorrer(seccion: str, comuna: str, max_pag: int, resultados: dict) -> None:
    """Recorre las páginas de una sección (comuna o barrio) acumulando en resultados."""
    for pagina in range(max_pag):
        desde = 1 + pagina * 49
        url = _url_paginada(seccion, desde)
        log(f"  página {pagina + 1} ({url})")
        html = _obtener_html(url)
        if not html:
            break
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("div.poly-card")
        if not cards:
            break
        nuevos = 0
        for c in cards:
            try:
                lst = _parse_card(c, comuna)
            except Exception as e:  # una tarjeta rota no debe botar todo
                log(f"  (tarjeta omitida: {e})")
                continue
            if lst and lst.id not in resultados:
                resultados[lst.id] = lst
                nuevos += 1
        log(f"  +{nuevos} nuevas (total {len(resultados)})")
        if nuevos == 0:
            break
        time.sleep(config.PAUSA_ENTRE_REQUESTS)


def scrape() -> list[Listing]:
    resultados: dict[str, Listing] = {}
    # 1) Red amplia por comuna (primeras páginas)
    for comuna in config.COMUNAS:
        log(f"\n› Portal Inmobiliario — comuna: {comuna}")
        _recorrer(f"{comuna}-metropolitana", comuna, config.MAX_PAGINAS_POR_COMUNA, resultados)
    # 2) Cobertura fina por BARRIO objetivo (para no perder el long tail de tu zona)
    for slug, comuna in config.BARRIOS_PI:
        log(f"\n› Portal Inmobiliario — barrio: {slug}")
        _recorrer(slug, comuna, config.MAX_PAGINAS_POR_BARRIO, resultados)
    return list(resultados.values())


def main():
    log("=== Scraper Portal Inmobiliario ===")
    listings = scrape()
    base.guardar(FUENTE, listings)


if __name__ == "__main__":
    main()
