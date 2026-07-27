# ◼ Área Gris · Visor de Arriendos

Variante del [visor principal](../README.md) hecha para **Área Gris**: busca un
departamento para **vivir solo** en los mismos barrios (Parque Bustamante ·
Lastarria · Salvador · Barrio Italia · Manuel Montt), con estos criterios:

- **Tope $350.000 TOTAL** (arriendo + gastos comunes)
- **Sin amoblar**
- **Sin estacionamiento** y **sin bodega** (no pagar por lo que no se usa)
- Studio o 1 dormitorio sirve (vive una persona)

**Visor online:** https://langab.github.io/visor_arriendos/area_gris/
(se actualiza solo con la corrida diaria del proyecto principal)

---

## Cómo funciona (optimizado: pipeline compartido)

Esta carpeta **no duplica código**: `run_all.py` importa los módulos del visor
principal (`../scrapers/`, `../consolidate.py`, `../geocode.py`, `../metro.py`,
`../snapshots.py`, `../enrich_pi.py`) pero con el `config.py` de ESTA carpeta.
Como `area_gris/` va primero en `sys.path`, todo el pipeline lee estos criterios
y escribe sus salidas aquí adentro:

```
area_gris/
├── config.py        ← criterios de Área Gris + hook de match (AJUSTAR_LISTING)
├── run_all.py       ← orquestador (reusa el pipeline de ../)
├── serve.py         ← servidor local opcional (puerto 8001)
├── data/            ← raw por portal, master.json/csv, caches, snapshots
└── viewer/          ← visor con diseño gris (index.html, style.css, app.js)
    ├── data.js      ← lo genera consolidate.py
    └── historia/    ← foto completa por día (filtro por fecha de extracción)
```

```bash
cd area_gris
python3 run_all.py --enrich    # scrapea + consolida + geocodifica + detalle
open viewer/index.html         # o: python3 serve.py
```

Cualquier arreglo a los scrapers del proyecto principal beneficia a los dos
visores automáticamente.

## El match "Área Gris"

`config.AJUSTAR_LISTING()` redefine el match por aviso:

**match = total ≤ $350.000 · en barrio objetivo · sin amoblar · sin
estacionamiento · sin bodega**

- **Amoblado**: dato real de la ficha de Portal Inmobiliario cuando se corre
  `--enrich`; si no hay dato, se detecta por el título. Los avisos amoblados
  casi siempre lo anuncian, así que "sin dato" se asume sin amoblar.
- **Estacionamiento / bodega**: campos de la ficha de detalle, más detección
  por título ("con estacionamiento y bodega" → tiene).
- Los gastos comunes sin dato se estiman en **$70.000** (studios/1D).

## Detalles heredados del visor principal

- 5 vistas: Lista, Mapa, Métricas, Ofertas (análisis de precios por grupo de
  características, mediana robusta) y Análisis temporal (fotos por día).
- ★ favoritas y ✓ contactadas se guardan en el navegador de quien lo mira
  (claves `areagris_*`, independientes del visor principal).
- Los avisos con arriendo sobre $600.000 se descartan al consolidar
  (`PRECIO_DESCARTE_CLP`): muy fuera de rango para esta búsqueda.
- La actualización diaria de las 10:00 (`../run_daily.sh`) corre también este
  pipeline y sube el resultado a GitHub Pages.
