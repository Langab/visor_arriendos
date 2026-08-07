#!/bin/bash
# ---------------------------------------------------------------------------
# Corrida ÚNICA del visor Juan Rozas — se AUTO-DESACTIVA al terminar.
#
# Existe porque el 07-ago-2026 MercadoLibre bloqueó la IP todo el día y no
# se pudo extraer; este script corre una vez a la mañana siguiente (launchd,
# com.visorarriendos.juan.once, 06:45 o al despertar el Mac) y luego elimina
# su propia agenda. NO es el cron diario: el visor de Juan se actualiza a
# mano (ver juan_rozas/README.md).
#
# Solo pushea si la corrida produjo una foto NUEVA (si ML sigue bloqueando,
# el guard de consolidate.py conserva la base anterior y aquí no se sube nada).
# ---------------------------------------------------------------------------
set -o pipefail
PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROY" || exit 1
export PATH="/Users/langa/anaconda3/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG="$PROY/data/juan_once.log"
echo "========== $(date '+%Y-%m-%d %H:%M:%S') corrida única Juan Rozas ==========" >> "$LOG"

git pull --ff-only origin master >> "$LOG" 2>&1 || \
    echo "(pull falló: sigo con lo local)" >> "$LOG"

fecha_data() {
    python3 -c "
import re
try:
    m = re.search(r'\"fecha_actual\": ?\"([^\"]+)\"', open('juan_rozas/viewer/data.js').read(3000))
    print(m.group(1) if m else '')
except Exception:
    print('')"
}

ANTES="$(fecha_data)"
python3 juan_rozas/run_all.py --enrich >> "$LOG" 2>&1
DESPUES="$(fecha_data)"

if [ -n "$DESPUES" ] && [ "$DESPUES" != "$ANTES" ]; then
    git add -A >> "$LOG" 2>&1
    git -c user.name="Benjamín Lang" -c user.email="Benjalang1997@gmail.com" \
        commit -m "Actualización visor Juan Rozas $(date '+%Y-%m-%d')" >> "$LOG" 2>&1
    git -c http.postBuffer=157286400 push origin master >> "$LOG" 2>&1 \
        && echo "✔ Foto nueva ($DESPUES) subida a GitHub." >> "$LOG" \
        || echo "⚠ Falló el push (revisar credenciales)." >> "$LOG"
else
    echo "Sin foto nueva (¿ML bloqueando aún?). No se sube nada." >> "$LOG"
fi

# --- auto-desactivación: esta agenda corre UNA vez ---
mv "$HOME/Library/LaunchAgents/com.visorarriendos.juan.once.plist" \
   "$HOME/Library/LaunchAgents/com.visorarriendos.juan.once.plist.done" 2>> "$LOG"
echo "Fin: $(date '+%H:%M:%S') — agenda auto-desactivada." >> "$LOG"
launchctl remove com.visorarriendos.juan.once 2>/dev/null || true
