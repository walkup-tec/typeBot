#!/bin/bash
# Diagnóstico ou primeira instalação. NÃO é necessário após cada deploy se `install` já rodou.
set -euo pipefail

SCRIPT="/root/traefik-permanent-vps.sh"
if [[ ! -x "$SCRIPT" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/traefik-permanent-vps.sh" -o "$SCRIPT"
  chmod +x "$SCRIPT"
fi

if [[ "${1:-}" == "install" ]]; then
  exec "$SCRIPT" install
fi

if systemctl is-active traefik-permanent-watch.service >/dev/null 2>&1; then
  echo "Automação ativa (watch + timer). Últimas linhas do log:"
  tail -5 /var/log/traefik-permanent-fix.log 2>/dev/null || true
  exit 0
fi

echo "AVISO: automação não instalada. Rode: $SCRIPT install"
exec "$SCRIPT" run
