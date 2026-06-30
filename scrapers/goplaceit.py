"""
Scraper de GoPlaceIt.com  —  ESTADO: requiere navegador con JavaScript.

GoPlaceIt es un agregador (incluye lat/lng nativas, ideal para mapa) pero es una
SPA en React: el HTML inicial no trae las propiedades, se piden a su API interna
con tokens generados en el cliente. Misma interfaz que el resto.

Para activarlo: Playwright interceptando las respuestas XHR de su API de mapa,
o ingeniería inversa de su endpoint (cambia seguido). Ver scrapers/yapo.py.
"""
from __future__ import annotations

import base
from base import Listing, get, log

FUENTE = "goplaceit"


def scrape() -> list[Listing]:
    log("\n› GoPlaceIt.com")
    r = get("https://www.goplaceit.com/cl/", retries=1)
    if not r:
        log("  GoPlaceIt no respondió. Requiere Playwright.")
        return []
    log("  GoPlaceIt es una SPA: las propiedades vienen de su API interna por XHR. "
        "Requiere Playwright para capturarlas.")
    return []


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
