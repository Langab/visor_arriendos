#!/usr/bin/env python3
"""
ORQUESTADOR del visor ÁREA GRIS.

Reusa TODO el pipeline del visor principal (../scrapers, ../consolidate.py,
../geocode.py, ../metro.py, ../snapshots.py, ../enrich_pi.py) pero con la
configuración de ESTA carpeta (area_gris/config.py): como esta carpeta va
primera en sys.path, `import config` resuelve aquí y todas las salidas
(data/, viewer/data.js, historia) quedan dentro de area_gris/.

    python run_all.py                     # scrapea + consolida + geocodifica
    python run_all.py --solo-consolidar   # no scrapea, solo reconstruye master
    python run_all.py --sin-geo           # scrapea pero no geocodifica
    python run_all.py --enrich            # + ficha de detalle (Playwright)
"""
from __future__ import annotations

import argparse
import importlib
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(HERE)  # carpeta del visor principal (pipeline compartido)

# EL ORDEN IMPORTA: primero area_gris (nuestro config.py), luego la raíz
# (consolidate, geocode, metro, snapshots, enrich_pi) y sus scrapers.
sys.path.insert(0, os.path.join(RAIZ, "scrapers"))
sys.path.insert(0, RAIZ)
sys.path.insert(0, HERE)

import config  # noqa: E402  — debe ser el de area_gris

assert config.BASE_DIR == HERE, \
    "Se importó el config equivocado (debería ser area_gris/config.py)"

import consolidate  # noqa: E402  — módulo compartido; usa nuestro config

# Mismo orden que el visor principal; cada scraper es independiente.
SCRAPERS = [
    "portalinmobiliario",   # ✅ requests (fuente principal)
    "chilepropiedades",     # ✅ requests
    "yapo",                 # ✅ Scrapling/Camoufox (anti-bot; lento)
    "toctoc",               # ⚠ pendiente
    "goplaceit",            # ⚠ pendiente
    "facebook_marketplace", # import manual (area_gris/manual/*.csv)
]


def correr_scrapers():
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
    ap = argparse.ArgumentParser(description="Pipeline visor Área Gris")
    ap.add_argument("--solo-consolidar", action="store_true",
                    help="No scrapea; solo reconstruye master desde data/raw/")
    ap.add_argument("--sin-geo", action="store_true",
                    help="No geocodifica (más rápido, sin mapa para avisos nuevos)")
    ap.add_argument("--enrich", action="store_true",
                    help="Enriquece con la ficha de detalle (gastos comunes reales, "
                         "amoblado, estacionamientos, bodegas…) vía Playwright.")
    args = ap.parse_args()

    t0 = time.time()
    if not args.solo_consolidar:
        correr_scrapers()
    consolidate.consolidar(geo=not args.sin_geo, snapshot=not args.enrich)
    if args.enrich:
        print("\n" + "=" * 60 + "\nENRIQUECIENDO FICHAS (Playwright)\n" + "=" * 60)
        try:
            import enrich_pi
            sys.argv = ["enrich_pi.py", "--limit", "250"]
            enrich_pi.main()
            consolidate.consolidar(geo=not args.sin_geo)  # reconsolida con detalle
        except Exception:
            print("⚠ enriquecimiento falló (¿instalaste playwright?). Sigo sin él:")
            traceback.print_exc()
    print(f"\n✅ Área Gris listo en {time.time() - t0:.0f}s. "
          f"Abre area_gris/viewer/index.html para ver el resultado.")


if __name__ == "__main__":
    main()
