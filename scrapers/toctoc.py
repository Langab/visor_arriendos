"""
Scraper de TocToc.com  —  ESTADO: pendiente (reCAPTCHA + datos por XHR).

TocToc responde 200 pero protege los resultados con reCAPTCHA y los carga vía su
API interna. Con Scrapling/Camoufox se puede cargar la página, pero el reCAPTCHA
y la API interna hacen la extracción frágil. Misma interfaz que el resto.

Para activarlo: Scrapling con `page_action` que espere/scrollee y capture las
respuestas XHR de su API, o replicar ese endpoint. Ver scrapers/yapo.py para el
patrón base con Scrapling StealthyFetcher.
"""
from __future__ import annotations

import base
from base import Listing, log

FUENTE = "toctoc"


def scrape() -> list[Listing]:
    log("\n› TocToc.com — reCAPTCHA + datos por XHR, extracción frágil. "
        "Pendiente (ver nota en el módulo).")
    return []


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
