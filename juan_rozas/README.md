# ❄ Juan Rozas · El Frío Misterio de los Arriendos

Variante del [visor principal](../README.md) hecha para **Juan Rozas**: busca un
departamento para **vivir solo** en los mismos barrios (Parque Bustamante ·
Lastarria · Salvador · Barrio Italia · Manuel Montt), con estos criterios:

- **Tope $700.000 TOTAL** (arriendo + gastos comunes)
- **2 dormitorios** (dos piezas justas)
- **1 baño**
- Vive una persona

**Visor online:** https://langab.github.io/visor_arriendos/juan_rozas/
(se actualiza **a mano** cuando haga falta: `python3 run_all.py --enrich`
y luego commit + push — no va en la corrida diaria de las 10:00)

La estética (y la música que suena al abrirlo — sí, suena música) es un
homenaje a **Electrodomésticos** y su *El Frío Misterio*: frío nocturno de
refrigerador, tipografía de manual técnico y zumbido eléctrico de fondo.

---

## Cómo funciona (optimizado: pipeline compartido)

Esta carpeta **no duplica código**: `run_all.py` importa los módulos del visor
principal (`../scrapers/`, `../consolidate.py`, `../geocode.py`, `../metro.py`,
`../snapshots.py`, `../enrich_pi.py`) pero con el `config.py` de ESTA carpeta.
Como `juan_rozas/` va primero en `sys.path`, todo el pipeline lee estos
criterios y escribe sus salidas aquí adentro:

```
juan_rozas/
├── config.py        ← criterios de Juan + hook de match (AJUSTAR_LISTING)
├── run_all.py       ← orquestador (reusa el pipeline de ../)
├── serve.py         ← servidor local opcional (puerto 8002)
├── data/            ← raw por portal, master.json/csv, caches, snapshots
└── viewer/          ← visor "frío misterio" (index.html, style.css, app.js)
    ├── data.js      ← lo genera consolidate.py
    ├── img/         ← fotos del directorio evaluador
    └── historia/    ← foto completa por día (filtro por fecha de extracción)
```

```bash
cd juan_rozas
python3 run_all.py --enrich    # scrapea + consolida + geocodifica + detalle
open viewer/index.html         # o: python3 serve.py
```

Cualquier arreglo a los scrapers del proyecto principal beneficia a los tres
visores automáticamente.

## El match "Juan Rozas"

`config.AJUSTAR_LISTING()` redefine el match por aviso:

**match = total ≤ $700.000 · 2 dormitorios · 1 baño · en barrio objetivo**

- **Baños**: dato del listado; "sin dato" se asume 1 baño (en este rango los
  2D/2B casi siempre lo publican). El dato fino llega con `--enrich`.
- Los gastos comunes sin dato se estiman en **$100.000** (2D).
- Los avisos con arriendo sobre $1.000.000 se descartan al consolidar
  (`PRECIO_DESCARTE_CLP`): muy fuera de rango para esta búsqueda.

## Detalles heredados del visor principal

- 5 vistas de análisis: Lista, Mapa, Métricas, Ofertas (análisis de precios por
  grupo de características, mediana robusta) y Análisis temporal (fotos por
  día), más la vista **Método** con las notas metodológicas completas.
- ★ favoritas y ✓ contactadas se guardan en el navegador de quien lo mira
  (claves `juanrozas_*`, independientes de los otros visores).
- Este visor NO va en la corrida diaria: se actualiza a mano cuando haga
  falta (comando de arriba) y el push publica el resultado en GitHub Pages.
