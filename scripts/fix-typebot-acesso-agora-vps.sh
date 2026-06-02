#!/bin/bash
# Corrige AGORA builder/viewer (Traefik apontando para LP). Uso: bash fix-typebot-acesso-agora-vps.sh
set -euo pipefail

echo "=== Fix Typebot acesso (builder + viewer) ==="

curl -fsSL "https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/traefik-permanent-vps.sh" \
  -o /root/traefik-permanent-vps.sh
chmod +x /root/traefik-permanent-vps.sh

# 3 tentativas: patch + restart se builder ainda for LP Drax
for attempt in 1 2 3; do
  echo ""
  echo "--- Tentativa ${attempt}/3 ---"
  /root/traefik-permanent-vps.sh run || true
  body=$(curl -sS --resolve typebot-typebot-walkup-builder.achpyp.easypanel.host:443:127.0.0.1 \
    --max-time 12 "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin" 2>/dev/null || true)
  if ! grep -qiE 'Drax — Atendimento|Voltar ao início|Página não encontrada' <<<"$body"; then
    echo ""
    echo "OK: Builder responde Typebot"
    echo "  Login:  https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin"
    echo "  Fluxos: https://typebot-typebot-walkup-builder.achpyp.easypanel.host/w/cmohgh7ll0014ru1cwhg90xnp/typebots"
    echo "  Viewer: https://typebot-typebot-walkup-viewer.achpyp.easypanel.host"
    exit 0
  fi
  echo "Builder ainda na LP — restart Traefik..."
  traefik=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  [[ -n "$traefik" ]] && docker restart "$traefik" && sleep 15
done

echo ""
echo "ERRO: Builder ainda aponta para LP após 3 tentativas."
echo "No Easypanel: serviço typebot-walkup-builder → Domínios → destino IP:3000 do container builder"
BUILDER_IP=$(docker ps -q -f name=typebot-walkup-builder -f status=running | head -1 | xargs -I{} docker inspect {} \
  --format '{{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}' 2>/dev/null || true)
echo "IP builder na rede easypanel-typebot: ${BUILDER_IP:-desconhecido}"
exit 1
