# 🏠 Visor de Arriendos · Santiago

Herramienta para buscar y comparar departamentos en arriendo en el eje
**Parque Bustamante · Lastarria · Metro Salvador · Barrio Italia · Manuel Montt**,
con tope **$800.000 incluyendo gastos comunes** y **3 dormitorios** (2 grandes +
1 oficina). Scrapers re-ejecutables por portal → base maestra consolidada →
visor HTML con mapa y lista.

---

## Inicio rápido

```bash
cd visor_arriendos
pip install -r requirements.txt

python run_all.py          # scrapea + consolida + geocodifica + arma el visor
open viewer/index.html     # ábrelo en el navegador (o: python serve.py)
```

`run_all.py` es lo único que necesitas correr para **actualizar todo**. Vuélvelo
a correr cuando quieras refrescar los datos.

---

## Cómo está ordenado el proyecto

```
visor_arriendos/
├── config.py            ← TUS criterios: comunas, presupuesto, dormitorios, UF
├── run_all.py           ← orquestador maestro (corre todo)
├── consolidate.py       ← junta fuentes, deduplica, enriquece, geocodifica
├── geocode.py           ← direcciones → lat/lng (Nominatim, con cache)
├── serve.py             ← servidor local opcional
├── scrapers/
│   ├── base.py                  ← esquema común + utilidades (precio, UF, guardado)
│   ├── portalinmobiliario.py    ← ✅ FUNCIONA (fuente principal; agrega MercadoLibre)
│   ├── yapo.py                  ← requiere navegador JS (ver nota)
│   ├── toctoc.py                ← requiere navegador JS (ver nota)
│   ├── goplaceit.py             ← requiere navegador JS (ver nota)
│   └── facebook_marketplace.py  ← import manual por CSV
├── manual/
│   └── facebook_marketplace_template.csv
├── data/
│   ├── raw/             ← salida de cada scraper (un JSON por portal)
│   ├── master.json      ← base maestra consolidada
│   ├── master.csv       ← lo mismo en CSV (para Excel)
│   └── geocode_cache.json
└── viewer/
    ├── index.html       ← el visor
    ├── style.css
    ├── app.js
    └── data.js          ← datos para el visor (lo genera consolidate.py)
```

Cada scraper es **independiente**: puedes correrlo solo
(`python scrapers/portalinmobiliario.py`) o todos juntos con `run_all.py`.
Si uno falla, los demás continúan.

---

## El visor

- **Vista Lista** y **vista Mapa** (Leaflet + OpenStreetMap, sin API key).
- **Filtros**: texto, total mensual máx., dormitorios mínimos, comuna, barrio
  objetivo, fuente, “solo dentro de presupuesto”, “solo en barrios objetivo”,
  “ocultar contactadas”, y orden.
- **Botón ✓ Contactada** por propiedad — se guarda en tu navegador
  (`localStorage`), persiste entre sesiones.
- Cada tarjeta/pin lleva al **link oficial** (para ver fotos) y a **Google Maps**
  (para revisar el barrio).
- Colores: 🟢 calza (presupuesto + 3D) · 🟡 parcial · 🔴 fuera · 🟣 contactada.

---

## Estado de cada fuente (importante, sin humo)

| Portal | Estado | Detalle |
|---|---|---|
| **Portal Inmobiliario** | ✅ Funciona | HTML estático con dirección, precio, dorms, baños, m², plazo. Agrega el real estate de MercadoLibre Chile. **Es la fuente principal.** |
| **Yapo** | ⚠️ Requiere Playwright | Bloquea peticiones directas (5xx) y carga por JS. |
| **TocToc** | ⚠️ Requiere Playwright | Protegido con reCAPTCHA + API interna. |
| **GoPlaceIt** | ⚠️ Requiere Playwright | SPA: las propiedades vienen por XHR de su API interna. |
| **Facebook Marketplace** | ✋ Import manual | Exige login y su scraping viola los ToS. Usa la plantilla CSV. |

**Activar los que requieren navegador:** `pip install playwright && playwright
install chromium`, y completa la función `scrape_playwright()` de cada módulo
(hay una plantilla en `scrapers/yapo.py`).

**Facebook (manual):** copia `manual/facebook_marketplace_template.csv` a
`manual/facebook_marketplace.csv`, pega los avisos interesantes (una fila por
propiedad) y corre `run_all.py`: se integran solos al visor.

---

## Ajustar la búsqueda

Edita `config.py`:

- `COMUNAS` — comunas a scrapear.
- `PRESUPUESTO_MAX_CLP` — tope total (arriendo + gastos comunes).
- `DORMITORIOS_OBJETIVO` — lo ideal (default 3).
- `GASTOS_COMUNES_ESTIMADO_CLP` — estimación cuando el aviso no publica GC.
- `BARRIOS_OBJETIVO` — barrios que marcan relevancia y aparecen como filtro.
- `MAX_PAGINAS_POR_COMUNA` — cuántas páginas recorrer por comuna.

---

## Notas

- **Gastos comunes**: casi nunca vienen en el listado. Cuando faltan, el visor
  usa una estimación (`GASTOS_COMUNES_ESTIMADO_CLP`) y lo marca como “GC est.”.
- **UF → CLP**: se toma el valor del día desde mindicador.cl (con fallback).
- **Geocodificación**: aproximada a nivel de calle (Nominatim, 1 req/seg, con
  cache para no repetir). El link a Google Maps siempre apunta a la dirección
  exacta publicada.
- Uso personal. Respeta los términos de cada sitio y no abuses de la frecuencia.
```
