"""
Facebook Marketplace  —  IMPORT MANUAL (no scraping automático).

Facebook Marketplace exige sesión iniciada y su scraping automatizado viola los
Términos de Servicio y se bloquea agresivamente. La vía fiable y permitida es
copiar a mano los avisos interesantes a una planilla.

Este módulo LEE manual/facebook_marketplace.csv (si existe) y lo convierte al
esquema común para que aparezca en el visor junto al resto.

Plantilla: manual/facebook_marketplace_template.csv
Flujo:
    1. Copia la plantilla a manual/facebook_marketplace.csv
    2. Pega los avisos que te interesen (una fila por propiedad)
    3. Corre el pipeline normal (run_all.py): se integran solos.
"""
from __future__ import annotations

import csv
import os
import time

import base
from base import Listing, log, parse_precio, parse_int, parse_float
import config

FUENTE = "facebook_marketplace"
CSV_PATH = os.path.join(config.BASE_DIR, "manual", "facebook_marketplace.csv")


def scrape() -> list[Listing]:
    log("\n› Facebook Marketplace (import manual)")
    if not os.path.exists(CSV_PATH):
        log(f"  No existe {CSV_PATH}. Copia la plantilla y pega avisos para incluirlos.")
        return []

    out: list[Listing] = []
    with open(CSV_PATH, encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            if not (fila.get("url") or "").strip():
                continue
            precio_clp, precio_orig = parse_precio(fila.get("precio", ""))
            gc, _ = parse_precio(fila.get("gastos_comunes", ""))
            lst = Listing(
                fuente=FUENTE,
                url=fila["url"].strip(),
                titulo=(fila.get("titulo") or "").strip(),
                precio_clp=precio_clp,
                precio_original=precio_orig,
                gastos_comunes_clp=gc,
                dormitorios=parse_int(fila.get("dormitorios", "")),
                banos=parse_int(fila.get("banos", "")),
                superficie_m2=parse_float(fila.get("superficie_m2", "")),
                direccion=(fila.get("direccion") or "").strip(),
                comuna=(fila.get("comuna") or "").strip(),
                corredor=str(fila.get("corredor", "")).strip().lower() in ("si", "sí", "true", "1"),
                plazo_entrega=(fila.get("plazo_entrega") or "").strip(),
                imagen=(fila.get("imagen") or "").strip(),
                extraido_en=time.strftime("%Y-%m-%dT%H:%M:%S"),
            ).fill_id()
            out.append(lst)
    log(f"  {len(out)} avisos manuales importados.")
    return out


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
