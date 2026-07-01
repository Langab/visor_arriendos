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

- **3 vistas**: **Lista**, **Mapa** (Leaflet + OpenStreetMap, sin API key) y
  **Métricas** (dashboard con el embudo de cuántas se ajustan a lo que buscamos).
- **Botón 🎯 Match perfecto**: de un clic muestra solo lo que buscan tú y Pancho
  (3+ dormitorios · en barrio objetivo · ≤ $800.000 total). El número en el botón
  es cuántas calzan.
- **Filtros**: texto, total mensual máx., dormitorios mínimos, **distancia al
  metro**, **antigüedad del edificio** (incluye “más de 30 años”), comuna, barrio,
  fuente, “dentro de presupuesto”, “en barrios objetivo”, “admite mascotas 🐾”,
  “solo favoritas ⭐”, “ocultar contactadas”, y varios órdenes (incl. cercanía a
  metro y antigüedad).
- **⭐ Favoritas / de interés** y **✓ Contactada** por propiedad — se guardan en tu
  navegador (`localStorage`) y persisten entre sesiones. Filtra por “solo favoritas”.
- Cada tarjeta muestra: precio, **gastos comunes reales** (o estimados), total,
  dormitorios, baños, m², **antigüedad**, **mascotas**, barrio y **metro + metros
  de distancia**. Lleva al **link oficial** (fotos) y a **Google Maps**.
- Colores: 🎯 match perfecto · 🟢 calza · 🟡 parcial · 🔴 fuera · 🟣 contactada.

### Distancia al metro y antigüedad
- **Metro**: se calcula con la estación de Metro más cercana (coordenadas en
  `metro.py`, líneas 1/3/5/6 de la zona) — sin scraping.
- **Antigüedad y gastos comunes reales**: se extraen de la ficha de detalle de
  Portal Inmobiliario (que solo carga con JavaScript) usando **Playwright**.
  Corre `python run_all.py --enrich`, o `python enrich_pi.py`. Cachea en
  `data/detalle_cache.json`, así re-ejecutar no repite lo ya hecho.

---

## Estado de cada fuente (importante, sin humo)

| Portal | Estado | Detalle |
|---|---|---|
| **Portal Inmobiliario** | ✅ Funciona | HTML estático con dirección, precio, dorms, baños, m², plazo. Agrega el real estate de MercadoLibre Chile. **Es la fuente principal.** |
| **Chilepropiedades** | ✅ Funciona | HTML estático (`requests`, rápido): dirección completa, precio, dorms, baños, m². Segunda fuente grande. |
| **Yapo** | ✅ Funciona (Scrapling) | Bloquea `requests`; se scrapea con **Scrapling/Camoufox** (navegador sigiloso). Trae avisos de particulares que no están en PI. Es lento (~40 s/página). |
| **TocToc** | ⚠️ Pendiente | reCAPTCHA + datos por XHR. Base con Scrapling lista; falta interceptar su API. |
| **GoPlaceIt** | ⚠️ Pendiente | SPA: las propiedades vienen por XHR de su API interna. Falta interceptarla. |
| **Facebook Marketplace** | ✋ Import manual | Exige login y su scraping viola los ToS. Usa la plantilla CSV. |

**Scrapling** (para Yapo y base de TocToc/GoPlaceIt): `pip install scrapling &&
scrapling install`. Usa un Firefox sigiloso (Camoufox) que salta el anti-bot.
Ver el patrón en `scrapers/yapo.py`.

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
