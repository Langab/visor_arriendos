"""
Scraper de Yapo.cl  —  ESTADO: requiere navegador con JavaScript.

Yapo (new.yapo.cl) responde 522 / bloquea peticiones directas con `requests`
y carga los resultados con JavaScript (Next.js). Para extraerlo de forma fiable
hay que usar un navegador real.

Este módulo mantiene la MISMA interfaz que el resto (scrape() -> list[Listing]),
intenta la vía simple y, si está bloqueada, lo informa y devuelve [] sin romper
el pipeline.

Cómo activarlo de verdad (opción Playwright):
    pip install playwright && playwright install chromium
    Descomenta scrape_playwright() abajo y ajústalo a tu búsqueda.
"""
from __future__ import annotations

import time

import base
from base import Listing, get, log
import config

FUENTE = "yapo"
# new.yapo.cl usa códigos internos de comuna; estos son ejemplos frecuentes.
COMUNAS_YAPO = {"providencia": "331", "santiago": "344", "nunoa": "320"}


def scrape() -> list[Listing]:
    log("\n› Yapo.cl")
    url = ("https://new.yapo.cl/inmuebles/arriendo_de_departamentos"
           "?regiones=15&comunas=331")
    r = get(url, retries=1)
    if not r:
        log("  Yapo bloquea peticiones directas (anti-bot 5xx). "
            "Usa la vía Playwright documentada en este archivo, o el import manual.")
        return []
    # Si algún día responde HTML útil, aquí iría el parseo. Por ahora:
    log("  Respondió, pero el contenido se carga por JS. Requiere Playwright.")
    return []


# --- Plantilla opcional con Playwright (descomenta y ajusta) ----------------
# def scrape_playwright() -> list[Listing]:
#     from playwright.sync_api import sync_playwright
#     out = []
#     with sync_playwright() as p:
#         b = p.chromium.launch(headless=True)
#         page = b.new_page(user_agent=config.USER_AGENT)
#         for comuna, code in COMUNAS_YAPO.items():
#             page.goto(f"https://new.yapo.cl/inmuebles/arriendo_de_departamentos"
#                       f"?regiones=15&comunas={code}", wait_until="networkidle")
#             for card in page.query_selector_all('[data-testid="listing-card"]'):
#                 # ... extraer título, precio, link, atributos ...
#                 pass
#         b.close()
#     return out


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
