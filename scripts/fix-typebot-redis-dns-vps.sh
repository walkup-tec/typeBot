#!/bin/bash
# Corrige 502 quando REDIS_URL usa hostname mas ioredis resolve IP morto (Swarm DNS)
set -euo pipefail

NET="${EASYPANEL_NET:-easypanel-typebot}"
PASS="${REDIS_PASSWORD:-u49r1zh1q6yzq7ev11ko}"

BUILDER=$(docker ps -q -f name=typebot-walkup-builder -f status=running | head -1)
REDIS=$(docker ps -q -f name=typebot-walkup-redis -f status=running | head -1)

if [[ -z "$BUILDER" || -z "$REDIS" ]]; then
  echo "ERRO: builder ou redis não está Running"
  exit 1
fi

REDIS_IP=$(docker inspect "$REDIS" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}")
echo "=== Diagnóstico DNS Redis ==="
echo "Redis container IP (${NET}): ${REDIS_IP}"
echo ""

echo "Resolução DENTRO do builder:"
docker exec "$BUILDER" sh -c 'getent hosts typebot_typebot-walkup-redis 2>/dev/null || nslookup typebot_typebot-walkup-redis 2>/dev/null || true' || true
echo ""

echo "Todas variáveis REDIS no builder:"
docker inspect "$BUILDER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i redis || true
echo ""

if docker inspect "$BUILDER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -c '^REDIS_URL=' | grep -q '^2'; then
  echo "AVISO: mais de um REDIS_URL — remova duplicatas no Easypanel"
fi

echo "=== Correção recomendada (Easypanel builder + viewer) ==="
echo ""
echo "REDIS_URL=redis://:${PASS}@${REDIS_IP}:6379"
echo ""
echo "(IP direto na rede ${NET} — evita DNS Swarm apontando para 10.11.227.126)"
echo ""
echo "Depois no VPS:"
echo "  docker service update --force typebot_typebot-walkup-builder"
echo "  docker service update --force typebot_typebot-walkup-viewer"
echo "  sleep 50 && curl -sI https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin"
