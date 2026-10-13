#!/bin/bash
# ---------------------------------------------------------------------------
# Publica el visor principal en Cloudflare Pages:
#     https://visorarriendos.pages.dev
#
# Sube la carpeta viewer/ tal cual (HTML + data.js + historia/ + fuentes/).
# Pages solo transfiere los archivos que cambiaron.
# Lo corre run_daily.sh después de la extracción; a mano:  bash publicar.sh
# (GitHub Pages sigue funcionando igual en langab.github.io/visor_arriendos/)
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

PROYECTO="visorarriendos"
WRANGLER="wrangler@4.147.0"   # versión fija: no cambia sola de un día para otro
SITIO="viewer"

# iCloud a veces deja copias "data 2.js": no se publican
DUPLICADOS=$(find "$SITIO" -name "* [0-9].*" -o -name "* [0-9]" | head -5)
if [ -n "$DUPLICADOS" ]; then
    echo "⚠ Hay copias duplicadas de iCloud en $SITIO/ (bórralas y vuelve a publicar):"
    echo "$DUPLICADOS"
    exit 1
fi
[ -s "$SITIO/data.js" ] || { echo "⚠ Falta $SITIO/data.js: corre la extracción antes de publicar."; exit 1; }

# el proyecto de Pages se crea la primera vez (--force: si no, wrangler 4.14x
# lo manda a Workers y falla; una vez creado, todo lo demás va directo a Pages)
if ! npx --yes "$WRANGLER" pages project list 2>/dev/null | grep -qw "$PROYECTO"; then
    npx --yes "$WRANGLER" pages project create "$PROYECTO" --production-branch main --force
fi

npx --yes "$WRANGLER" pages deploy "$SITIO" \
    --project-name "$PROYECTO" --branch main --commit-dirty=true
echo "✔ Publicado en https://$PROYECTO.pages.dev"
