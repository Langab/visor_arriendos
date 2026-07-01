"""
Scraper de Chilepropiedades.cl  —  ✅ FUNCIONA con `requests` (HTML estático).

Portal grande con buena data en el listado: dirección completa (geocodable),
precio, dormitorios, baños, m² y estacionamientos. No tiene anti-bot en las
páginas de resultados, así que es rápido (no necesita navegador).

Uso:  python scrapers/chilepropiedades.py
"""
from __future__ import annotations

import re
import time

from bs4 import BeautifulSoup

import base
from base import Listing, get, log, parse_precio, parse_float
import config

FUENTE = "chilepropiedades"
HOME = "https://chilepropiedades.cl"

# slugs de comuna en la URL de Chilepropiedades
COMUNA_SLUG = {"providencia": "providencia", "santiago": "santiago", "nunoa": "nunoa"}


def _txt(el):
    return el.get_text(" ", strip=True) if el else ""


def _parse_card(c, comuna: str) -> Listing | None:
    a = c.select_one('a[href*="/ver-publicacion/"]')
    if not a:
        return None
    url = a["href"]
    if not url.startswith("http"):
        url = HOME + url

    # precio: dos spans ("$" y "750.000") o UF
    partes = [_txt(x) for x in c.select(".clp-value-container")]
    precio_txt = " ".join(partes[:2]) if partes else ""
    precio_clp, precio_orig = parse_precio(precio_txt)

    # features: habitaciones, baños, m², estacionamientos (en ese orden)
    feats = [_txt(x) for x in c.select(".clp-feature-value")]
    dorm = banos = sup = None
    otros = []
    for f in feats:
        if "m²" in f or "m2" in f:
            sup = parse_float(f)
        else:
            otros.append(f)
    if len(otros) >= 1 and otros[0].isdigit():
        dorm = int(otros[0])
    if len(otros) >= 2 and otros[1].isdigit():
        banos = int(otros[1])

    # el título viene como "Comuna, Calle 123" -> lo reordenamos a "Calle 123, Comuna"
    # para que la calle quede primera (así geocodifica bien, no al centro de comuna)
    raw = _txt(c.select_one(".publication-title-list"))
    comuna_txt = comuna.title()
    direccion = raw
    if "," in raw:
        primero, resto = raw.split(",", 1)
        comuna_txt = primero.strip()
        direccion = f"{resto.strip()}, {comuna_txt}"

    img_el = c.select_one("img")
    imagen = ""
    if img_el:
        imagen = img_el.get("src") or img_el.get("data-src") or ""
        if imagen and not imagen.startswith("http"):
            imagen = HOME + imagen

    lst = Listing(
        fuente=FUENTE, url=url, titulo=direccion[:160],
        precio_clp=precio_clp, precio_original=precio_orig,
        dormitorios=dorm, banos=banos, superficie_m2=sup,
        direccion=direccion, comuna=comuna_txt, imagen=imagen,
        corredor=None, extraido_en=time.strftime("%Y-%m-%dT%H:%M:%S"),
    )
    return lst.fill_id()


def scrape() -> list[Listing]:
    resultados: dict[str, Listing] = {}
    for comuna in config.COMUNAS:
        slug = COMUNA_SLUG.get(comuna, comuna)
        log(f"\n› Chilepropiedades — {slug}")
        for pagina in range(0, config.MAX_PAGINAS_POR_COMUNA):
            url = f"{HOME}/propiedades/arriendo-mensual/departamento/{slug}/{pagina}"
            r = get(url)
            if not r:
                break
            soup = BeautifulSoup(r.text, "html.parser")
            cards = soup.select(".clp-publication-element")
            if not cards:
                log(f"  pág.{pagina}: sin avisos, fin")
                break
            nuevos = 0
            for c in cards:
                try:
                    lst = _parse_card(c, comuna)
                except Exception:
                    continue
                if lst and lst.precio_clp and lst.id not in resultados:
                    resultados[lst.id] = lst
                    nuevos += 1
            log(f"  pág.{pagina}: +{nuevos} (total {len(resultados)})")
            time.sleep(config.PAUSA_ENTRE_REQUESTS)
    return list(resultados.values())


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
