#!/bin/bash
# Instala cron para auto-corrigir Traefik a cada 3 min (LP/painel/API/Typebot).
set -euo pipefail

SCRIPT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fix-traefik-easypanel-502.sh"
DEST="/root/fix-traefik-easypanel-502.sh"
LOG="/var/log/fix-traefik.log"

cp "$SCRIPT_SRC" "$DEST"
chmod +x "$DEST"

CRON_LINE="*/3 * * * * $DEST >> $LOG 2>&1"
( crontab -l 2>/dev/null | grep -v 'fix-traefik-easypanel-502' || true; echo "$CRON_LINE" ) | crontab -

echo "Instalado: $DEST"
echo "Cron: $CRON_LINE"
echo "Log: $LOG"
echo "Teste agora: $DEST"
