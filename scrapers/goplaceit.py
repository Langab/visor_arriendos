"""
Scraper de GoPlaceIt.com  —  ESTADO: pendiente (SPA con datos por XHR).

GoPlaceIt es un agregador con lat/lng nativas (ideal para el mapa), pero es una
SPA React: el HTML —incluso cargado con Scrapling/Camoufox— NO trae las
propiedades; se piden a su API interna por XHR con tokens del cliente.

Para activarlo hay que **interceptar las respuestas de red** de su API de mapa
(Scrapling permite un `page_action` con Playwright para escuchar responses), o
hacer ingeniería inversa del endpoint (cambia seguido). El scraper de Yapo
(scrapers/yapo.py) muestra el patrón base con Scrapling StealthyFetcher.
"""
from __future__ import annotations

import base
from base import Listing, log

FUENTE = "goplaceit"


def scrape() -> list[Listing]:
    log("\n› GoPlaceIt.com — SPA con datos por XHR, requiere interceptar la API interna. "
        "Pendiente (ver nota en el módulo).")
    return []


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
