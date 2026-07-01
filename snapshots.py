"""
Sistema de "fotos" (snapshots) fechadas para análisis temporal.

Cada vez que se consolida, se guarda una foto compacta de la base en
data/snapshots/<fecha>.json y se compara con la foto anterior para detectar:
  - avisos NUEVOS (aparecieron desde la última actualización)
  - CAMBIOS DE PRECIO (subieron / bajaron)
  - avisos que DESAPARECIERON

Además mantiene data/snapshots/index.json con un resumen por fecha (serie
temporal) que alimenta la pestaña "Análisis temporal" del visor.
"""
from __future__ import annotations

import glob
import json
import os
import statistics
import time

import config

SNAP_DIR = os.path.join(config.DATA_DIR, "snapshots")
INDICE = os.path.join(SNAP_DIR, "index.json")

# Campos que guardamos por aviso en la foto (compacto)
_CAMPOS = ("id", "titulo", "url", "fuente", "precio_clp", "total_estimado_clp",
           "dormitorios", "barrio", "comuna", "match_perfecto")


def _foto_compacta(listings: list[dict]) -> dict:
    return {l["id"]: {k: l.get(k) for k in _CAMPOS} for l in listings if l.get("id")}


def _ultima_foto() -> tuple[str | None, dict]:
    """Devuelve (fecha, {id: entry}) de la foto más reciente ya guardada."""
    os.makedirs(SNAP_DIR, exist_ok=True)
    fotos = sorted(glob.glob(os.path.join(SNAP_DIR, "20*.json")))
    if not fotos:
        return None, {}
    ult = fotos[-1]
    fecha = os.path.splitext(os.path.basename(ult))[0]
    try:
        return fecha, json.load(open(ult, encoding="utf-8"))
    except Exception:
        return None, {}


def _cargar_indice() -> list[dict]:
    if os.path.exists(INDICE):
        try:
            return json.load(open(INDICE, encoding="utf-8"))
        except Exception:
            return []
    return []


def _guardar_historia_viewer(listings: list[dict], fecha: str) -> list[str]:
    """
    Guarda la foto COMPLETA del día en viewer/historia/<fecha>.js (con todos los
    campos, para que el visor pueda mostrar ese día tal cual). El visor la carga
    bajo demanda al elegir la fecha. Conserva solo las últimas HISTORIA_MAX_DIAS.
    Devuelve la lista de fechas disponibles (desc, la más reciente primero).
    """
    os.makedirs(config.HISTORIA_DIR, exist_ok=True)
    path = os.path.join(config.HISTORIA_DIR, f"{fecha}.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.HISTORIA=window.HISTORIA||{};\n")
        f.write(f'window.HISTORIA["{fecha}"]=' +
                json.dumps(listings, ensure_ascii=False) + ";\n")

    # poda: deja solo las últimas N
    fotos = sorted(glob.glob(os.path.join(config.HISTORIA_DIR, "20*.js")))
    for viejo in fotos[:-config.HISTORIA_MAX_DIAS]:
        try:
            os.remove(viejo)
        except OSError:
            pass

    fechas = sorted(
        (os.path.splitext(os.path.basename(p))[0]
         for p in glob.glob(os.path.join(config.HISTORIA_DIR, "20*.js"))),
        reverse=True,
    )
    return fechas


def procesar(listings: list[dict]) -> dict:
    """
    Compara los listings actuales con la última foto, marca cada aviso
    (es_nuevo / precio_anterior / precio_delta), guarda la nueva foto y
    actualiza el índice. Devuelve un resumen temporal para el META del visor.
    """
    os.makedirs(SNAP_DIR, exist_ok=True)
    fecha_prev, prev = _ultima_foto()
    ahora = time.strftime("%Y-%m-%d_%H%M")

    nuevos, bajaron, subieron = 0, 0, 0
    for l in listings:
        antes = prev.get(l.get("id", ""))
        if prev and antes is None:
            l["es_nuevo"] = True
            nuevos += 1
        else:
            l["es_nuevo"] = False
        l["precio_anterior"] = None
        l["precio_delta"] = None
        if antes and antes.get("precio_clp") and l.get("precio_clp"):
            if antes["precio_clp"] != l["precio_clp"]:
                l["precio_anterior"] = antes["precio_clp"]
                l["precio_delta"] = l["precio_clp"] - antes["precio_clp"]
                if l["precio_delta"] < 0:
                    bajaron += 1
                else:
                    subieron += 1

    ids_ahora = {l["id"] for l in listings if l.get("id")}
    # avisos que estaban en la foto anterior y ya no están: guardamos su ficha
    desaparecidos_lista = [prev[i] for i in prev if i not in ids_ahora]
    desaparecidos = len(desaparecidos_lista)

    # Guarda la nueva foto
    foto_path = os.path.join(SNAP_DIR, f"{ahora}.json")
    json.dump(_foto_compacta(listings), open(foto_path, "w", encoding="utf-8"),
              ensure_ascii=False)

    # Resumen para el índice (serie temporal)
    totales = [l["total_estimado_clp"] for l in listings if l.get("total_estimado_clp")]
    resumen = {
        "fecha": ahora,
        "total": len(listings),
        "match_perfecto": sum(1 for l in listings if l.get("match_perfecto")),
        "dentro_presupuesto": sum(1 for l in listings if l.get("dentro_presupuesto")),
        "tres_dorms": sum(1 for l in listings if (l.get("dormitorios") or 0) >= 3),
        "en_barrio": sum(1 for l in listings if l.get("en_barrio_objetivo")),
        "precio_mediano": int(statistics.median(totales)) if totales else None,
        "nuevos": nuevos,
        "bajaron_precio": bajaron,
        "subieron_precio": subieron,
    }
    indice = _cargar_indice()
    indice.append(resumen)
    json.dump(indice, open(INDICE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # Foto COMPLETA navegable para el visor (para el filtro "por fecha de extracción")
    fechas_disponibles = _guardar_historia_viewer(listings, ahora)

    print(f"📸 Snapshot {ahora}: {nuevos} nuevos, {bajaron} bajaron, "
          f"{subieron} subieron de precio, {desaparecidos} desaparecieron "
          f"(vs {fecha_prev or 'primera foto'})")

    return {
        "ultima_actualizacion": time.strftime("%Y-%m-%d %H:%M"),
        "fecha_actual": ahora,
        "fechas_disponibles": fechas_disponibles,
        "fecha_anterior": fecha_prev,
        "nuevos_desde_anterior": nuevos,
        "bajaron_precio": bajaron,
        "subieron_precio": subieron,
        "desaparecidos": desaparecidos,
        "desaparecidos_lista": desaparecidos_lista[:60],  # para listarlos en el visor
        "es_primera_foto": fecha_prev is None,
        "serie_temporal": indice,
    }
