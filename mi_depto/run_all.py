#!/usr/bin/env python3
"""
ORQUESTADOR del visor MI DEPTO (≤ $600.000 · ideal Lastarria / Diagonal Paraguay).

Reusa TODO el pipeline del visor principal (../../scrapers, ../../consolidate.py,
../../geocode.py, ../../metro.py, ../../snapshots.py, ../../enrich_pi.py) con la
configuración de ESTA carpeta (mi_depto/config.py). Todo queda en mi_depto/.

    python run_all.py                     # scrapea + consolida + geocodifica
    python run_all.py --solo-consolidar   # no scrapea, solo reconstruye master
    python run_all.py --sin-geo           # scrapea pero no geocodifica
    python run_all.py --enrich            # + ficha de detalle (Playwright)
    python run_all.py --desde-raiz        # no scrapea: usa data/raw del visor
                                          # principal si es de hoy o ayer (tope
                                          # $850.000 ⊃ $600.000, mismas comunas)
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import os
import shutil
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(HERE)  # carpeta del visor principal (pipeline compartido)

# EL ORDEN IMPORTA: primero esta carpeta (nuestro config.py), luego la raíz
# (consolidate, geocode, metro, snapshots, enrich_pi) y sus scrapers.
sys.path.insert(0, os.path.join(RAIZ, "scrapers"))
sys.path.insert(0, RAIZ)
sys.path.insert(0, HERE)

import config  # noqa: E402  — debe ser el de mi_depto

assert config.BASE_DIR == HERE, \
    "Se importó el config equivocado (debería ser mi_depto/config.py)"

import consolidate  # noqa: E402  — módulo compartido; usa nuestro config

SCRAPERS = [
    "portalinmobiliario",   # ✅ requests → Scrapling si aparece el muro anti-bot
    "chilepropiedades",     # ✅ requests
    "yapo",                 # ✅ Scrapling/Camoufox (lento)
    "toctoc",               # ⚠ pendiente
    "goplaceit",            # ⚠ pendiente
    "facebook_marketplace", # import manual (mi_depto/manual/*.csv)
]

# Caches de los otros visores: geocodificación (por dirección) y fichas de
# detalle (por id de aviso) valen igual para todos. Sembrarlas evita volver a
# preguntarle a Nominatim y volver a abrir cientos de fichas con Playwright.
CACHES_HERMANAS = [
    os.path.join(RAIZ, "data"),
    os.path.join(RAIZ, "area_gris", "data"),
    os.path.join(RAIZ, "area_gris", "roomies", "data"),
    # el clon de la automática tiene los caches al día (iCloud puede ir atrás)
    os.path.expanduser("~/Proyectos_automaticos/visor_arriendos/data"),
]


def sembrar_caches():
    for nombre in ("geocode_cache.json", "detalle_cache.json"):
        destino = os.path.join(config.DATA_DIR, nombre)
        propia = {}
        if os.path.exists(destino):
            try:
                propia = json.load(open(destino, encoding="utf-8"))
            except Exception:
                propia = {}
        antes = len(propia)
        for carpeta in CACHES_HERMANAS:
            p = os.path.join(carpeta, nombre)
            if not os.path.exists(p):
                continue
            try:
                otra = json.load(open(p, encoding="utf-8"))
            except Exception:
                continue
            for k, v in otra.items():
                # detalle_cache: {} es "la ficha falló" y se reintenta, no se siembra.
                # geocode_cache: None es "Nominatim no la encontró" y sí se siembra,
                # igual que en los otros visores (si no, se vuelve a preguntar).
                if k in propia or (nombre == "detalle_cache.json" and not v):
                    continue
                propia[k] = v
        if len(propia) > antes:
            os.makedirs(config.DATA_DIR, exist_ok=True)
            json.dump(propia, open(destino, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=2)
            print(f"  {nombre}: +{len(propia) - antes} entradas de los otros visores")


def copiar_raw_de_la_raiz() -> bool:
    """Copia data/raw del visor principal (tope $850.000, mismas comunas) si es
    de hoy o de ayer. Mira la raíz de esta copia y el clon de la automática y
    usa la más fresca. Devuelve False si no hay nada fresco (hay que scrapear)."""
    candidatas = [os.path.join(RAIZ, "data", "raw"),
                  os.path.expanduser("~/Proyectos_automaticos/visor_arriendos/data/raw")]
    mejor = None
    for origen in candidatas:
        pi = os.path.join(origen, "portalinmobiliario.json")
        if not os.path.exists(pi):
            continue
        try:
            if len(json.load(open(pi, encoding="utf-8"))) < 50:
                continue
        except Exception:
            continue
        t = os.path.getmtime(pi)
        if mejor is None or t > mejor[1]:
            mejor = (origen, t)
    if not mejor or (dt.date.today() - dt.date.fromtimestamp(mejor[1])).days > 1:
        print("  no hay data/raw del visor principal de hoy o ayer: scrapeo aparte.")
        return False
    origen = mejor[0]
    os.makedirs(config.RAW_DIR, exist_ok=True)
    for f in os.listdir(origen):
        if f.endswith(".json"):
            shutil.copy2(os.path.join(origen, f), os.path.join(config.RAW_DIR, f))
    print(f"  usando data/raw del visor principal ({origen}, "
          f"{dt.datetime.fromtimestamp(mejor[1]):%d-%m %H:%M}).")
    return True


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
    ap = argparse.ArgumentParser(description="Pipeline visor Mi Depto")
    ap.add_argument("--solo-consolidar", action="store_true",
                    help="No scrapea; solo reconstruye master desde data/raw/")
    ap.add_argument("--sin-geo", action="store_true",
                    help="No geocodifica (más rápido, sin mapa para avisos nuevos)")
    ap.add_argument("--enrich", action="store_true",
                    help="Enriquece con la ficha de detalle vía Playwright.")
    ap.add_argument("--desde-raiz", action="store_true",
                    help="Usa data/raw del visor principal si es de hoy o ayer.")
    args = ap.parse_args()

    t0 = time.time()
    sembrar_caches()
    if not args.solo_consolidar:
        if not (args.desde_raiz and copiar_raw_de_la_raiz()):
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
    print(f"\n✅ Mi Depto listo en {time.time() - t0:.0f}s. "
          f"Abre mi_depto/viewer/index.html para ver el resultado.")


if __name__ == "__main__":
    main()
