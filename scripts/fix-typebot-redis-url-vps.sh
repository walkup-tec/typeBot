#!/bin/bash
# Mostra REDIS_URL correto para builder/viewer (host Docker, não IP morto)
set -euo pipefail

REDIS_CID=$(docker ps -q -f name=typebot-walkup-redis -f status=running | head -1)
if [[ -z "$REDIS_CID" ]]; then
  echo "ERRO: Redis typebot-walkup-redis não está Running"
  exit 1
fi

echo "=== Redis Typebot — URL correta ==="
echo "Container: $(docker inspect "$REDIS_CID" --format '{{.Name}}' | sed 's/^\///')"
echo ""

# Senha: variáveis comuns em imagens redis / easypanel
PASS=""
while IFS= read -r line; do
  case "$line" in
    REDIS_PASSWORD=*) PASS="${line#REDIS_PASSWORD=}" ;;
    REDISCLI_AUTH=*) [[ -z "$PASS" ]] && PASS="${line#REDISCLI_AUTH=}" ;;
  esac
done < <(docker inspect "$REDIS_CID" --format '{{range .Config.Env}}{{println .}}{{end}}')

if [[ -z "$PASS" ]]; then
  # fallback: comando do container (--requirepass)
  CMD=$(docker inspect "$REDIS_CID" --format '{{json .Config.Cmd}}')
  PASS=$(echo "$CMD" | grep -oE 'requirepass[^"]*' | head -1 | sed 's/.*requirepass[^a-zA-Z0-9]*//' || true)
fi

HOST="typebot_typebot-walkup-redis"
PORT="6379"

if [[ -n "$PASS" ]]; then
  URL="redis://:${PASS}@${HOST}:${PORT}"
else
  URL="redis://${HOST}:${PORT}"
  echo "AVISO: senha não detectada automaticamente — confira no Easypanel serviço redis"
fi

echo "Cole no Easypanel (builder E viewer):"
echo ""
echo "REDIS_URL=${URL}"
echo ""
echo "Depois: Restart typebot-walkup-builder e typebot-walkup-viewer"
echo ""
echo "Teste:"
echo "  curl -sI https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin"
