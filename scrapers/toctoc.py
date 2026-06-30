"""
Scraper de TocToc.com  —  ESTADO: requiere navegador con JavaScript.

TocToc responde 200 pero protege los resultados con reCAPTCHA y los carga vía
llamadas a su API interna desde el navegador. No es extraíble de forma estable
con `requests`. Misma interfaz que el resto; intenta y, si no hay datos
utilizables, devuelve [] con un mensaje claro.

Para activarlo de verdad: Playwright (ver scrapers/yapo.py para el patrón) o,
si descubres su endpoint de API interno, replicar las cabeceras del navegador.
"""
from __future__ import annotations

import base
from base import Listing, get, log
import config

FUENTE = "toctoc"


def scrape() -> list[Listing]:
    log("\n› TocToc.com")
    url = "https://www.toctoc.com/resultados/arriendo-departamento/providencia/"
    r = get(url, retries=1)
    if not r:
        log("  TocToc no respondió. Requiere Playwright.")
        return []
    if "recaptcha" in r.text.lower() or "__NEXT_DATA__" not in r.text:
        log("  TocToc protege los resultados con reCAPTCHA / carga por JS. "
            "Requiere Playwright o su API interna.")
        return []
    return []


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
