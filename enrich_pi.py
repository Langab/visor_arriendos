"""
Enriquecimiento de avisos de Portal Inmobiliario con datos de la página de detalle
(que PI solo muestra con JavaScript): GASTOS COMUNES reales, ANTIGÜEDAD, admite
mascotas, estacionamientos, bodegas, piso, orientación, superficie útil/total.

Usa Playwright (navegador headless). Para no tardar horas, enriquece solo el
subconjunto relevante (configurable) y cachea por id en data/detalle_cache.json,
así re-ejecutar no repite lo ya hecho.

Uso:
    python enrich_pi.py                # enriquece los relevantes (según --limit)
    python enrich_pi.py --limit 300
    python enrich_pi.py --todos        # todos los de Portal Inmobiliario (lento)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time

import config

CACHE = os.path.join(config.DATA_DIR, "detalle_cache.json")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def _num(s):
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def parse_detalle(txt: str) -> dict:
    """Extrae campos del texto renderizado de la ficha (formato 'Etiqueta\\nValor')."""
    d = {}
    m = re.search(r"Gastos comunes(?:\s+desde)?\s*\$?\s*([\d\.]+)", txt)
    if m:
        d["gastos_comunes_clp"] = _num(m.group(1))

    m = re.search(r"Antig[üu]edad\s*\n?\s*(\d+)\s*a", txt, re.I)
    if m:
        d["antiguedad_anios"] = int(m.group(1))
    elif re.search(r"A estrenar|Estreno|En (?:verde|blanco)", txt, re.I):
        d["antiguedad_anios"] = 0

    m = re.search(r"Admite mascotas\s*\n?\s*(S[íi]|No)", txt, re.I)
    if m:
        d["admite_mascotas"] = m.group(1).lower().startswith("s")

    m = re.search(r"Estacionamientos\s*\n?\s*(\d+)", txt)
    if m:
        d["estacionamientos"] = int(m.group(1))

    m = re.search(r"Bodegas\s*\n?\s*(\d+)", txt)
    if m:
        d["bodegas"] = int(m.group(1))

    m = re.search(r"N[úu]mero de piso(?: de la unidad)?\s*\n?\s*(\d+)", txt)
    if m:
        d["piso"] = int(m.group(1))

    m = re.search(r"Orientaci[óo]n[:\s]*\n?\s*([A-ZÁÉÍÓÚ]{1,3})\b", txt)
    if m:
        d["orientacion"] = m.group(1)

    m = re.search(r"Superficie [úu]til\s*\n?\s*([\d\.]+)\s*m", txt)
    if m:
        d["superficie_util_m2"] = _num(m.group(1))
    m = re.search(r"Superficie total\s*\n?\s*([\d\.]+)\s*m", txt)
    if m:
        d["superficie_total_m2"] = _num(m.group(1))

    # ¿corredora o particular?  PI muestra el nombre del publicador
    if re.search(r"Inmobiliaria|Propiedades|Corredora|Corredores|Brokers?", txt):
        d["corredor"] = True
    return d


def seleccionar(listings, limit, todos):
    pi = [l for l in listings if l.get("fuente") == "portalinmobiliario" and "MLC" in l.get("url", "")]
    if todos:
        return pi
    # relevantes: 2+ dorms y total acotado, o en barrio objetivo; ordenados por relevancia
    rel = [l for l in pi if (l.get("dormitorios") or 0) >= 2
           and (l.get("total_estimado_clp") or 0) <= config.PRESUPUESTO_MAX_CLP + 150_000
           or l.get("en_barrio_objetivo")]
    rel.sort(key=lambda l: -(l.get("relevancia") or 0))
    return rel[:limit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=250)
    ap.add_argument("--todos", action="store_true")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    with open(config.MASTER_JSON, encoding="utf-8") as f:
        listings = json.load(f)
    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))

    objetivo = seleccionar(listings, args.limit, args.todos)
    pendientes = [l for l in objetivo if l["id"] not in cache]
    print(f"Enriqueciendo {len(pendientes)} fichas "
          f"({len(objetivo) - len(pendientes)} ya en cache)...")

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(user_agent=UA)
        for i, l in enumerate(pendientes, 1):
            try:
                pg.goto(l["url"], wait_until="domcontentloaded", timeout=35000)
                try:
                    pg.wait_for_selector("text=Antigüedad", timeout=6000)
                except Exception:
                    pg.wait_for_timeout(1500)
                txt = pg.inner_text("body")
                cache[l["id"]] = parse_detalle(txt)
            except Exception as e:
                print(f"  [{i}] error {l['id']}: {e.__class__.__name__}")
                cache[l["id"]] = {}
            if i % 15 == 0:
                json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
                hechos = sum(1 for v in cache.values() if v.get("gastos_comunes_clp"))
                print(f"  ...{i}/{len(pendientes)} (con gastos comunes: {hechos})", flush=True)
        b.close()

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    con_gc = sum(1 for v in cache.values() if v.get("gastos_comunes_clp"))
    con_ant = sum(1 for v in cache.values() if v.get("antiguedad_anios") is not None)
    print(f"Listo: {len(cache)} fichas · {con_gc} con gastos comunes · {con_ant} con antigüedad")


if __name__ == "__main__":
    main()
