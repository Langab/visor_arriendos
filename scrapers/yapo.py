"""
Scraper de Yapo.cl con **Scrapling** (StealthyFetcher / Camoufox).

Yapo migró a un sitio nuevo protegido con anti-bot que bloquea `requests`
(devuelve 5xx). Scrapling usa un navegador Firefox sigiloso (Camoufox) que sí
carga la página; los avisos vienen renderizados en el HTML (`.d3-ad-tile`).

Es más lento que Portal Inmobiliario (~40 s por página), por eso hacemos pocas
páginas por comuna. Filtramos por comuna/barrio objetivo en el parseo.

Uso:  python scrapers/yapo.py
"""
from __future__ import annotations

import re
import time
import unicodedata

import base
from base import Listing, log, parse_precio
import config

FUENTE = "yapo"
HOME = "https://www.yapo.cl"
CAT = "/bienes-raices-alquiler-apartamentos"
MAX_PAGINAS = 2  # StealthyFetcher es lento; subir con cuidado


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return s.lower()


def _fetch(url):
    from scrapling.fetchers import StealthyFetcher
    return StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=90000)


def _txt(el):
    try:
        return (el.text or "").strip()
    except Exception:
        return ""


def _parse_tile(t, comuna_q: str) -> Listing | None:
    # link real del aviso (href con id numérico)
    url = ""
    for a in t.css("a"):
        h = a.attrib.get("href", "")
        if re.search(r"/\d{6,}", h):
            url = h if h.startswith("http") else HOME + h
            break
    if not url:
        return None

    titulo = _txt(t.css_first(".d3-ad-tile__title")) if hasattr(t, "css_first") else ""
    if not titulo:
        el = t.css(".d3-ad-tile__title")
        titulo = _txt(el[0]) if el else ""
    precio_el = t.css(".d3-ad-tile__price")
    precio_clp, precio_orig = parse_precio(_txt(precio_el[0]) if precio_el else "")

    full = t.get_all_text(separator=" | ", strip=True)

    # dormitorios / baños desde el título ("3D 2B", "3 dorm")
    dorm = None
    m = re.search(r"(\d+)\s*[dD](?:orm)?\b", titulo)
    if m:
        dorm = int(m.group(1))
    banos = None
    m = re.search(r"(\d+)\s*[bB](?:a[ñn]o)?", titulo)
    if m:
        banos = int(m.group(1))

    # comuna/barrio: la buscamos en el texto del aviso
    comuna = comuna_q.title()
    barrio = ""
    for b in config.BARRIOS_OBJETIVO:
        if _norm(b) in _norm(full):
            barrio = b
            break

    # imagen
    imagen = ""
    for img in t.css("img"):
        src = img.attrib.get("src") or img.attrib.get("data-src") or ""
        if src.startswith("http"):
            imagen = src
            break

    lst = Listing(
        fuente=FUENTE, url=url, titulo=titulo[:160],
        precio_clp=precio_clp, precio_original=precio_orig,
        dormitorios=dorm, banos=banos, direccion=comuna, comuna=comuna,
        barrio=barrio, imagen=imagen, corredor=None,
        extraido_en=time.strftime("%Y-%m-%dT%H:%M:%S"),
    )
    return lst.fill_id()


def _relevante(full_text: str) -> bool:
    """¿El aviso menciona una comuna o barrio objetivo?"""
    t = _norm(full_text)
    objetivos = [_norm(c) for c in config.COMUNAS] + [_norm(b) for b in config.BARRIOS_OBJETIVO]
    return any(o in t for o in objetivos)


def scrape() -> list[Listing]:
    log("\n› Yapo.cl (Scrapling / Camoufox — lento)")
    try:
        import scrapling  # noqa: F401
    except ImportError:
        log("  Scrapling no está instalado. `pip install scrapling && scrapling install`")
        return []

    resultados: dict[str, Listing] = {}
    for comuna in config.COMUNAS:
        q = comuna.replace("nunoa", "ñuñoa")
        for pagina in range(1, MAX_PAGINAS + 1):
            url = f"{HOME}{CAT}?q={q}" + (f"&o={pagina}" if pagina > 1 else "")
            log(f"  {q} pág.{pagina}  ({url})")
            try:
                page = _fetch(url)
            except Exception as e:
                log(f"  error Scrapling: {e.__class__.__name__}: {str(e)[:80]}")
                break
            tiles = page.css(".d3-ad-tile")
            if not tiles:
                log("  sin tarjetas (¿cambió el sitio?)")
                break
            nuevos = 0
            for t in tiles:
                full = t.get_all_text(strip=True)
                if not _relevante(full):
                    continue
                try:
                    lst = _parse_tile(t, q)
                except Exception:
                    continue
                if lst and lst.precio_clp and lst.id not in resultados:
                    resultados[lst.id] = lst
                    nuevos += 1
            log(f"  +{nuevos} relevantes (total {len(resultados)})")
            time.sleep(1)
    return list(resultados.values())


def main():
    base.guardar(FUENTE, scrape())


if __name__ == "__main__":
    main()
