"""
Consolida los JSON de data/raw/*.json en una base maestra:

  - Une todas las fuentes
  - Deduplica por id (URL) y por (dirección+precio) aproximado
  - Detecta el barrio objetivo a partir de la dirección
  - Calcula gastos comunes estimados y el TOTAL estimado
  - Marca relevancia (¿calza con dormitorios y presupuesto?)
  - Geocodifica direcciones faltantes (lat/lng) -> mapa
  - Escribe data/master.json, data/master.csv y viewer/data.js

Se ejecuta solo desde run_all.py, o suelto:  python consolidate.py
"""
from __future__ import annotations

import csv
import glob
import json
import os
import re
import statistics
import unicodedata

import config
import geocode
import metro

DETALLE_CACHE = os.path.join(config.DATA_DIR, "detalle_cache.json")


def _cargar_detalle() -> dict:
    if os.path.exists(DETALLE_CACHE):
        try:
            return json.load(open(DETALLE_CACHE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return s.lower().strip()


def _detectar_barrio(direccion: str) -> str:
    d = _norm(direccion)
    for b in config.BARRIOS_OBJETIVO:
        if _norm(b) in d:
            return b
    return ""


def cargar_raw() -> list[dict]:
    listings = []
    for path in sorted(glob.glob(os.path.join(config.RAW_DIR, "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            listings.extend(data)
            print(f"  {os.path.basename(path)}: {len(data)} avisos")
        except Exception as e:
            print(f"  (no se pudo leer {path}: {e})")
    return listings


def deduplicar(listings: list[dict]) -> list[dict]:
    vistos_id: dict[str, dict] = {}
    vistos_clave: set[str] = set()
    out = []
    for l in listings:
        lid = l.get("id") or ""
        if lid and lid in vistos_id:
            continue
        # clave secundaria: dirección normalizada + precio (atrapa el mismo aviso
        # republicado o cruzado entre fuentes)
        clave = f"{_norm(l.get('direccion',''))}|{l.get('precio_clp')}"
        if clave.strip("|") and clave in vistos_clave:
            continue
        vistos_id[lid] = l
        vistos_clave.add(clave)
        out.append(l)
    return out


def _parse_moneda(precio_original: str):
    """Del texto publicado deduce (moneda, monto_uf). 'UF 13,5' -> ('UF', 13.5)."""
    t = (precio_original or "").upper()
    if "UF" in t:
        num = re.sub(r"[^\d,\.]", "", t).replace(".", "").replace(",", ".")
        try:
            return "UF", round(float(num), 1) if num else None
        except ValueError:
            return "UF", None
    return "CLP", None


def enriquecer(listings: list[dict]) -> list[dict]:
    detalle = _cargar_detalle()
    for l in listings:
        l["barrio"] = l.get("barrio") or _detectar_barrio(l.get("direccion", ""))

        # Moneda del arriendo: UF o pesos. Si es UF guardamos el monto en UF, que
        # es el valor ESTABLE (el CLP cambia solo porque cambia la UF del día).
        l["moneda"], l["precio_uf"] = _parse_moneda(l.get("precio_original", ""))

        # Fusiona datos de la ficha de detalle (gastos comunes reales, antigüedad,
        # mascotas, estacionamientos, etc.) cuando existen.
        d = detalle.get(l.get("id", ""), {})
        for campo in ("antiguedad_anios", "admite_mascotas", "estacionamientos",
                      "bodegas", "piso", "orientacion", "superficie_util_m2",
                      "superficie_total_m2"):
            if campo in d:
                l[campo] = d[campo]
        if d.get("gastos_comunes_clp"):
            l["gastos_comunes_clp"] = d["gastos_comunes_clp"]
        if d.get("corredor") is not None:
            l["corredor"] = d["corredor"]

        # Gastos comunes: usa el real si existe, si no estima
        gc = l.get("gastos_comunes_clp")
        l["gastos_comunes_estimado"] = gc is None
        gc_calc = gc if gc is not None else config.GASTOS_COMUNES_ESTIMADO_CLP

        precio = l.get("precio_clp")
        l["total_estimado_clp"] = (precio + gc_calc) if precio else None

        # Distancia a la estación de metro más cercana
        if l.get("lat") and l.get("lng"):
            est, linea, dist = metro.estacion_mas_cercana(l["lat"], l["lng"])
            l["metro_cercano"] = est
            l["metro_linea"] = linea
            l["metro_dist_m"] = dist
        else:
            l["metro_cercano"] = ""
            l["metro_dist_m"] = None

        # ¿Es "mariposa"? (best-effort desde el título, PI no lo trae estructurado)
        l["es_mariposa"] = "mariposa" in (l.get("titulo", "") or "").lower()

        # ¿Calza con la búsqueda?
        dorm = l.get("dormitorios") or 0
        sup = l.get("superficie_m2") or 0
        total = l.get("total_estimado_clp")
        l["calza_dormitorios"] = dorm >= config.DORMITORIOS_OBJETIVO
        l["dentro_presupuesto"] = bool(total and total <= config.PRESUPUESTO_MAX_CLP)
        l["en_barrio_objetivo"] = bool(l["barrio"])

        # Un 2D amplio (≥ SUPERFICIE_MIN_2D_M2) sirve como oficina y también califica.
        sirve_layout = dorm >= config.DORMITORIOS_OBJETIVO or \
            (dorm >= 2 and sup >= config.SUPERFICIE_MIN_2D_M2)

        # MATCH PERFECTO: layout que nos sirve (3+ piezas, o 2D amplio) + en barrio
        # objetivo + total ≤ presupuesto.
        l["match_perfecto"] = bool(
            sirve_layout and l["dentro_presupuesto"] and l["en_barrio_objetivo"]
        )

        # Puntaje de relevancia para ordenar (0-100)
        score = 0
        if l["dentro_presupuesto"]:
            score += 40
        if l["calza_dormitorios"]:
            score += 35
        elif dorm >= config.DORMITORIOS_MIN:
            score += 15
        if l["en_barrio_objetivo"]:
            score += 25
        if l.get("metro_dist_m") is not None and l["metro_dist_m"] <= 500:
            score += 5
        if l["match_perfecto"]:
            score += 10
        l["relevancia"] = score

        # Link a Google Maps (para revisar el barrio)
        if l.get("lat") and l.get("lng"):
            l["google_maps"] = f"https://www.google.com/maps/search/?api=1&query={l['lat']},{l['lng']}"
        elif l.get("direccion"):
            from urllib.parse import quote
            q = quote(f"{l['direccion']}, {l.get('comuna','')}, Santiago, Chile")
            l["google_maps"] = f"https://www.google.com/maps/search/?api=1&query={q}"
        else:
            l["google_maps"] = ""
    return listings


def _uf_valor_del_dia(listings: list[dict]) -> int:
    """Valor UF usado en la extracción, derivado de los avisos en UF (clp/uf)."""
    ratios = [l["precio_clp"] / l["precio_uf"] for l in listings
              if l.get("moneda") == "UF" and l.get("precio_uf") and l.get("precio_clp")]
    return int(round(statistics.median(ratios))) if ratios else config.UF_TO_CLP_FALLBACK


def escribir_salidas(listings: list[dict], temporal: dict | None = None):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    # ordena por relevancia desc y luego por total asc
    listings.sort(key=lambda l: (-l.get("relevancia", 0),
                                 l.get("total_estimado_clp") or 10**9))

    with open(config.MASTER_JSON, "w", encoding="utf-8") as f:
        json.dump(listings, f, ensure_ascii=False, indent=2)
    print(f"✔ {config.MASTER_JSON} ({len(listings)} avisos)")

    # CSV
    campos = ["id", "fuente", "titulo", "moneda", "precio_uf", "precio_clp",
              "gastos_comunes_clp",
              "gastos_comunes_estimado", "total_estimado_clp", "dormitorios",
              "banos", "superficie_m2", "antiguedad_anios", "admite_mascotas",
              "estacionamientos", "bodegas", "piso", "orientacion",
              "direccion", "comuna", "barrio", "metro_cercano", "metro_dist_m",
              "corredor", "plazo_entrega", "lat", "lng", "relevancia",
              "match_perfecto", "dentro_presupuesto", "calza_dormitorios",
              "es_nuevo", "precio_anterior", "precio_delta",
              "url", "google_maps"]
    with open(config.MASTER_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        for l in listings:
            w.writerow(l)
    print(f"✔ {config.MASTER_CSV}")

    # data.js para el visor (evita problemas de CORS al abrir el HTML directo)
    os.makedirs(os.path.dirname(config.VIEWER_DATA_JS), exist_ok=True)
    import time
    meta = {
        "generado": time.strftime("%Y-%m-%d %H:%M"),
        "total": len(listings),
        "presupuesto_max": config.PRESUPUESTO_MAX_CLP,
        "dormitorios_objetivo": config.DORMITORIOS_OBJETIVO,
        "barrios": config.BARRIOS_OBJETIVO,
        "match_perfecto": sum(1 for l in listings if l.get("match_perfecto")),
        "con_gastos_reales": sum(1 for l in listings if not l.get("gastos_comunes_estimado")),
        "con_antiguedad": sum(1 for l in listings if l.get("antiguedad_anios") is not None),
        "en_uf": sum(1 for l in listings if l.get("moneda") == "UF"),
        "uf_valor": _uf_valor_del_dia(listings),
    }
    if temporal:
        meta.update(temporal)
    with open(config.VIEWER_DATA_JS, "w", encoding="utf-8") as f:
        f.write("// Generado automáticamente por consolidate.py — no editar a mano.\n")
        f.write("window.META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
        f.write("window.LISTINGS = " + json.dumps(listings, ensure_ascii=False) + ";\n")
    print(f"✔ {config.VIEWER_DATA_JS}")


def consolidar(geo: bool = True, snapshot: bool = True):
    print("\n=== Consolidando fuentes ===")
    listings = cargar_raw()
    print(f"Total bruto: {len(listings)}")
    listings = deduplicar(listings)
    print(f"Tras deduplicar: {len(listings)}")
    if geo:
        listings = geocode.geocodificar(listings)
    listings = enriquecer(listings)
    # Foto fechada + comparación temporal (marca es_nuevo / precio_delta).
    # snapshot=False en la consolidación intermedia de run_all --enrich, para que
    # cada actualización genere UNA sola foto (la final, ya enriquecida).
    temporal = None
    if snapshot:
        import snapshots
        temporal = snapshots.procesar(listings)
    escribir_salidas(listings, temporal)
    # Resumen útil
    calzan = [l for l in listings if l["dentro_presupuesto"] and l["calza_dormitorios"]]
    print(f"\n→ {len(calzan)} avisos calzan con TU búsqueda "
          f"(≥{config.DORMITORIOS_OBJETIVO}D y ≤${config.PRESUPUESTO_MAX_CLP:,} total)"
          .replace(",", "."))
    return listings


if __name__ == "__main__":
    consolidar()
