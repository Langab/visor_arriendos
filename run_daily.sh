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

PROY="/Users/langa/Desktop/visor_arriendos"
cd "$PROY" || exit 1

# rutas necesarias (anaconda para python, homebrew para git/gh, camoufox, etc.)
export PATH="/Users/langa/anaconda3/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG="$PROY/data/cron.log"
echo "========== $(date '+%Y-%m-%d %H:%M:%S') ==========" >> "$LOG"

# 1) Pipeline: PI + Chilepropiedades + Yapo, consolida y saca la foto del día.
#    (--enrich agrega gastos comunes/antigüedad reales a los avisos nuevos; usa
#     cache, así solo enriquece lo nuevo. Quita --enrich si prefieres más rápido.)
python3 run_all.py --enrich >> "$LOG" 2>&1

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
