"""
Scraper de Portal Inmobiliario (portalinmobiliario.com).

Es la fuente principal: agrega el real estate de MercadoLibre Chile y entrega
direcciones completas (geocodificables), precio, dormitorios, baños, m² y plazo
de entrega directamente en la página de resultados (HTML estático, sin JS).

Uso:
    python scrapers/portalinmobiliario.py        # corre y guarda data/raw/portalinmobiliario.json
"""
from __future__ import annotations

import re
import time

from bs4 import BeautifulSoup

import base
from base import Listing, get, log, parse_precio, parse_int, parse_float
import config

FUENTE = "portalinmobiliario"
BASE_URL = "https://www.portalinmobiliario.com"


def _url_busqueda(comuna: str, desde: int) -> str:
    """
    Construye la URL de resultados para una comuna y un offset de paginación.
    PI pagina con el sufijo _Desde_<n> (49 por página).
    """
    precio = f"_PriceRange_0CLP-{config.PRECIO_MAX_SCRAPE_CLP}CLP"
    base_path = f"{BASE_URL}/arriendo/departamento/{comuna}-metropolitana/{precio}"
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


def scrape() -> list[Listing]:
    resultados: dict[str, Listing] = {}
    for comuna in config.COMUNAS:
        log(f"\n› Portal Inmobiliario — comuna: {comuna}")
        for pagina in range(config.MAX_PAGINAS_POR_COMUNA):
            desde = 1 + pagina * 49
            url = _url_busqueda(comuna, desde)
            log(f"  página {pagina + 1} ({url})")
            r = get(url)
            if not r:
                break
            soup = BeautifulSoup(r.text, "html.parser")
            cards = soup.select("div.poly-card")
            if not cards:
                log("  sin resultados en esta página, paso a la siguiente comuna")
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
            log(f"  +{nuevos} propiedades nuevas (total {len(resultados)})")
            if nuevos == 0:
                break
            time.sleep(config.PAUSA_ENTRE_REQUESTS)
    return list(resultados.values())


def main():
    log("=== Scraper Portal Inmobiliario ===")
    listings = scrape()
    base.guardar(FUENTE, listings)


if __name__ == "__main__":
    main()
