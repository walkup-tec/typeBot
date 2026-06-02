#!/bin/bash
# Verificação pós-correção Redis — cole saída se ainda 502
set -euo pipefail

BUILDER=$(docker ps -q -f name=typebot-walkup-builder -f status=running | head -1)
REDIS=$(docker ps -q -f name=typebot-walkup-redis -f status=running | head -1)

echo "=== Verificação builder Typebot ==="
echo "Publico:" $(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin)
echo ""

if [[ -z "$BUILDER" ]]; then
  echo "ERRO: builder não está Running"
  docker ps -a --format '{{.Names}} {{.Status}}' | grep walkup-builder | head -5
  exit 1
fi

echo "--- REDIS_URL no builder (host apenas) ---"
docker inspect "$BUILDER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^REDIS_URL=' \
  | sed -E 's#(redis://(:[^@]+)?@)[^:/]+#\1HOST#' || echo "(ausente)"
echo ""

REDIS_HOST=$(docker inspect "$BUILDER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^REDIS_URL=' | sed -n 's#.*@\([^:/]*\):.*#\1#p')
if [[ "$REDIS_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo ">>> AINDA ERRADO: REDIS aponta para IP $REDIS_HOST"
  echo ">>> Troque no Easypanel por: typebot_typebot-walkup-redis"
  echo ""
fi

echo "--- Ping Redis na rede easypanel-typebot ---"
if [[ -n "$REDIS" ]]; then
  docker run --rm --network easypanel-typebot redis:7-alpine redis-cli -h typebot_typebot-walkup-redis ping 2>&1 || \
    echo "(falhou sem senha — redis pode exigir password no Easypanel)"
fi
echo ""

echo "--- App :3000 dentro do builder ---"
if docker exec "$BUILDER" wget -qS -O /dev/null --timeout=4 http://127.0.0.1:3000/signin 2>&1 | head -3; then
  echo "OK wget"
else
  echo "FALHA — últimas linhas do log:"
  docker logs --tail 15 "$BUILDER" 2>&1
fi
