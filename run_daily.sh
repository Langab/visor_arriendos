#!/bin/bash
# ---------------------------------------------------------------------------
# Actualización diaria automática del visor de arriendos.
# Lo ejecuta launchd todos los días a las 10:00 (ver
# ~/Library/LaunchAgents/com.visorarriendos.daily.plist).
#
# Corre el pipeline completo (scrapers + consolidación + foto del día) y sube
# los cambios a GitHub para poder revisarlos sin correr nada a mano.
# ---------------------------------------------------------------------------
set -o pipefail

# La carpeta del proyecto es donde vive ESTE script (funciona igual en la
# copia de iCloud y en el clon de automatización ~/Proyectos_automaticos,
# que existe porque launchd no puede ejecutar nada dentro de iCloud por TCC).
PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROY" || exit 1

# rutas necesarias (anaconda para python, homebrew para git/gh, camoufox, etc.)
export PATH="/Users/langa/anaconda3/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG="$PROY/data/cron.log"
echo "========== $(date '+%Y-%m-%d %H:%M:%S') ==========" >> "$LOG"

# 0) Traer lo último pusheado (código y datos), para que el clon de
#    automatización corra siempre la versión vigente del pipeline.
git pull --ff-only origin master >> "$LOG" 2>&1 || \
    echo "(pull falló o hay divergencia: sigo con lo local)" >> "$LOG"

# 1) Pipeline: PI + Chilepropiedades + Yapo, consolida y saca la foto del día.
#    (--enrich agrega gastos comunes/antigüedad reales a los avisos nuevos; usa
#     cache, así solo enriquece lo nuevo. Quita --enrich si prefieres más rápido.)
python3 run_all.py --enrich >> "$LOG" 2>&1

# 1b) Visor ÁREA GRIS (variante 1 persona / ≤$350k): mismo pipeline, otro config.
python3 area_gris/run_all.py --enrich >> "$LOG" 2>&1

# 1c) Visor JUAN ROZAS: se actualiza A MANO cuando haga falta (no en el cron,
#     para que la corrida diaria sea más corta y no caliente la IP con ML):
#         cd juan_rozas && python3 run_all.py --enrich
#     y luego commit+push (o pedírselo a Claude).

# 2) Commit + push (solo si hubo cambios). Usa el token del llavero (osxkeychain).
git add -A >> "$LOG" 2>&1
if git diff --cached --quiet; then
    echo "Sin cambios que subir." >> "$LOG"
else
    git -c user.name="Benjamín Lang" -c user.email="Benjalang1997@gmail.com" \
        commit -m "Actualización automática $(date '+%Y-%m-%d')" >> "$LOG" 2>&1
    git push origin master >> "$LOG" 2>&1 && \
        echo "✔ Subido a GitHub." >> "$LOG" || \
        echo "⚠ Falló el push (revisa credenciales del llavero)." >> "$LOG"
fi
echo "Fin: $(date '+%H:%M:%S')" >> "$LOG"
