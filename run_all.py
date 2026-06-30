#!/usr/bin/env python3
"""
ORQUESTADOR MAESTRO del visor de arriendos.

Corre todos los scrapers (cada uno independiente), luego consolida, geocodifica
y genera la base maestra + los datos del visor. Es el único comando que necesitas
para actualizar todo:

    python run_all.py                # todo
    python run_all.py --solo-consolidar   # no scrapea, solo reconstruye master
    python run_all.py --sin-geo           # scrapea pero no geocodifica (más rápido)

Cada scraper es independiente: si uno falla, los demás siguen.
"""
from __future__ import annotations

import argparse
import importlib
import sys
import time
import traceback

import consolidate

# Orden de ejecución. Agrega aquí nuevos scrapers (deben exponer scrape() y main()).
SCRAPERS = [
    "portalinmobiliario",   # ← fuente principal que funciona
    "yapo",                 # requiere Playwright (ver módulo)
    "toctoc",               # requiere Playwright (ver módulo)
    "goplaceit",            # requiere Playwright (ver módulo)
    "facebook_marketplace", # import manual (manual/facebook_marketplace.csv)
]


def correr_scrapers():
    sys.path.insert(0, "scrapers")
    for nombre in SCRAPERS:
        print("\n" + "=" * 60)
        print(f"SCRAPER: {nombre}")
        print("=" * 60)
        try:
            mod = importlib.import_module(nombre)
            mod.main()
        except Exception:
            print(f"⚠ {nombre} falló (los demás continúan):")
            traceback.print_exc()
        time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser(description="Pipeline visor de arriendos")
    ap.add_argument("--solo-consolidar", action="store_true",
                    help="No scrapea; solo reconstruye master desde data/raw/")
    ap.add_argument("--sin-geo", action="store_true",
                    help="No geocodifica (más rápido, sin mapa para avisos nuevos)")
    args = ap.parse_args()

    t0 = time.time()
    if not args.solo_consolidar:
        correr_scrapers()
    consolidate.consolidar(geo=not args.sin_geo)
    print(f"\n✅ Listo en {time.time() - t0:.0f}s. "
          f"Abre viewer/index.html para ver el resultado.")


if __name__ == "__main__":
    main()
