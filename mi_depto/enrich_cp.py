"""
Gastos comunes REALES para los avisos de Chilepropiedades.

El listado de Chilepropiedades no trae gastos comunes, así que el visor los
estimaba en $100.000. Pero muchos los dicen en la descripción de la ficha
("Gastos comunes $60.000 aprox."): con el tope de $600.000 TOTAL, $40.000 de
diferencia deja afuera departamentos que sí sirven (pasó con el de
Ismael Valdés Vergara 514, que se usó de ejemplo).

Abre la ficha solo de los avisos que podrían calzar (2+ dormitorios y
arriendo ≤ tope), lee la descripción y guarda lo encontrado en
data/detalle_cache.json con la misma forma que usa enrich_pi, así
consolidate.py lo fusiona sin cambios. Usa cache: cada ficha se abre una vez.
"""
from __future__ import annotations

import html
import json
import os
import re
import time

import requests

import config

DETALLE_CACHE = os.path.join(config.DATA_DIR, "detalle_cache.json")
RAW_CP = os.path.join(config.RAW_DIR, "chilepropiedades.json")
MAX_FICHAS = 80          # por corrida (cortesía con el portal)

_RE_GC = re.compile(
    r"(?:gastos?\s+com[uú]n(?:es)?|g\.?\s?c\.?)\s*(?:de|aprox\.?|aproximad[oa]s?|:|son|\s)*"
    r"\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{2,6})\s*(mil\b)?",
    re.I,
)
_RE_INCLUIDOS = re.compile(r"gastos?\s+com[uú]n(?:es)?\s+inclu", re.I)
_RE_PISO = re.compile(r"\b(\d{1,2})\s*(?:°|º|er|do|ro|to|vo|no|mo)?\s*piso\b", re.I)


def _descripcion(pagina: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", pagina, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    t = re.sub(r"[ \t]+", " ", t)
    i = t.find("Descripción")
    while i != -1 and "Ver descripción completa" not in t[i:i + 4000]:
        i = t.find("Descripción", i + 1)
    if i == -1:
        return ""
    j = t.find("Ver descripción completa", i)
    return re.sub(r"\s*\n\s*", " ", t[i + len("Descripción"):j]).strip()


def gastos_comunes(desc: str) -> int | None:
    if _RE_INCLUIDOS.search(desc):
        return None              # "gastos comunes incluidos": el arriendo ya los trae
    for m in _RE_GC.finditer(desc):
        n = int(re.sub(r"\D", "", m.group(1)))
        if m.group(2):           # "60 mil"
            n *= 1000
        if 10_000 <= n <= 300_000:
            return n
    return None


def main():
    if not os.path.exists(RAW_CP):
        print("  enrich_cp: no hay data/raw/chilepropiedades.json")
        return
    avisos = json.load(open(RAW_CP, encoding="utf-8"))
    cache = {}
    if os.path.exists(DETALLE_CACHE):
        try:
            cache = json.load(open(DETALLE_CACHE, encoding="utf-8"))
        except Exception:
            cache = {}

    candidatos = [
        a for a in avisos
        if a.get("id") and a.get("url", "").startswith("https://chilepropiedades.cl/")
        and (a.get("dormitorios") or 0) >= config.DORMITORIOS_MIN
        and (a.get("precio_clp") or 0) and a["precio_clp"] <= config.PRESUPUESTO_MAX_CLP
        and "cp_revisado" not in cache.get(a["id"], {})
    ][:MAX_FICHAS]
    print(f"  enrich_cp: {len(candidatos)} fichas de Chilepropiedades por revisar")

    s = requests.Session()
    s.headers["User-Agent"] = config.USER_AGENT
    encontrados = 0
    for a in candidatos:
        try:
            r = s.get(a["url"], timeout=config.REQUEST_TIMEOUT)
            r.raise_for_status()
        except Exception as e:
            print(f"    ⚠ {a['url']}: {e}")
            continue
        desc = _descripcion(r.text)
        d = dict(cache.get(a["id"], {}))
        d["cp_revisado"] = True
        gc = gastos_comunes(desc)
        if gc:
            d["gastos_comunes_clp"] = gc
            encontrados += 1
        m = _RE_PISO.search(desc)
        if m and "piso" not in d:
            d["piso"] = int(m.group(1))
        cache[a["id"]] = d
        time.sleep(config.PAUSA_ENTRE_REQUESTS)

    os.makedirs(config.DATA_DIR, exist_ok=True)
    json.dump(cache, open(DETALLE_CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  enrich_cp: gastos comunes reales en {encontrados} de {len(candidatos)}")
