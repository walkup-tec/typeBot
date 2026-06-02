#!/bin/bash
# Corrige 502 público no Typebot Builder/Viewer quando o app responde 200 na rede Docker
# mas HTTPS (Traefik/Easypanel) retorna 502. Implementa passos 12–16 do plano typebot_502_proxy.
#
# Uso no VPS (root):
#   curl -sSL https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/fix-typebot-builder-proxy-502-vps.sh -o /tmp/fix-typebot-proxy.sh
#   bash /tmp/fix-typebot-proxy.sh

set -euo pipefail

NET="${EASYPANEL_NET:-easypanel-typebot}"
CFG="${TRAEFIK_CFG:-/etc/easypanel/traefik/config/main.yaml}"
BUILDER_HOST="${BUILDER_HOST:-typebot_typebot-walkup-builder}"
VIEWER_HOST="${VIEWER_HOST:-typebot_typebot-walkup-viewer}"
PUBLIC_BUILDER_SIGNIN="${PUBLIC_BUILDER_SIGNIN:-https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin}"
PUBLIC_VIEWER="${PUBLIC_VIEWER:-https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/}"
API_HEALTH="${API_HEALTH:-https://app.chattypebot.com/health}"

echo "=== Typebot proxy 502 — fix VPS ==="
echo "Data: $(date -Is)"
echo ""

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
BUILDER_IP=$(container_ip typebot-walkup-builder || true)
VIEWER_IP=$(container_ip typebot-walkup-viewer || true)

if [[ -z "$BUILDER_IP" ]]; then
  echo "ERRO: builder não Running ou sem IP em ${NET}"
  exit 1
fi

echo "Builder IP=${BUILDER_IP} Viewer IP=${VIEWER_IP:-<não running>}"
echo ""

# --- Passo 12: teste público ---
echo "--- Passo 12: HTTPS público (builder /signin) ---"
BUILDER_PUBLIC=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 "$PUBLIC_BUILDER_SIGNIN" 2>/dev/null || echo "000")
echo "  $PUBLIC_BUILDER_SIGNIN -> HTTP ${BUILDER_PUBLIC}"
if [[ "$BUILDER_PUBLIC" =~ ^(200|307|302)$ ]]; then
  echo "  OK: builder público já responde — nada a fazer."
  exit 0
fi
echo ""

# --- Passo 12b: rede Docker (referência) ---
echo "--- Rede ${NET} (hostname) ---"
docker run --rm --network "$NET" curlimages/curl:8.5.0 -sI --max-time 8 \
  "http://${BUILDER_HOST}:3000/signin" 2>/dev/null | head -1 || echo "  (curl falhou)"
echo ""

if [[ -z "$TRAEFIK" ]]; then
  echo "ERRO: container easypanel-traefik não está Running"
  exit 1
fi

# --- Passo 13: Traefik alcança builder? ---
echo "--- Passo 13: Traefik -> ${BUILDER_HOST}:3000/signin ---"
TRAEFIK_BUILDER_OK=0
if docker exec "$TRAEFIK" wget -qO- --timeout=6 "http://${BUILDER_HOST}:3000/signin" >/dev/null 2>&1; then
  echo "  OK: Traefik alcança pelo hostname Swarm"
  TRAEFIK_BUILDER_OK=1
elif docker exec "$TRAEFIK" wget -qO- --timeout=6 "http://${BUILDER_IP}:3000/signin" >/dev/null 2>&1; then
  echo "  OK: Traefik alcança pelo IP ${BUILDER_IP} (hostname falhou)"
  TRAEFIK_BUILDER_OK=1
else
  echo "  FALHA: Traefik não alcança builder — aplicando Passo 14"
  docker exec "$TRAEFIK" wget -S -O- --timeout=4 "http://${BUILDER_HOST}:3000/signin" 2>&1 | head -6 || true
fi
echo ""

# --- Passo 14: conectar Traefik às redes e reiniciar ---
if [[ "$TRAEFIK_BUILDER_OK" -eq 0 ]]; then
  echo "--- Passo 14: network connect + restart Traefik ---"
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
  docker restart "$TRAEFIK"
  sleep 10
  TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  if docker exec "$TRAEFIK" wget -qO- --timeout=6 "http://${BUILDER_HOST}:3000/signin" >/dev/null 2>&1; then
    echo "  OK após restart: Traefik alcança builder"
    TRAEFIK_BUILDER_OK=1
  fi
  echo ""
fi

# --- Passo 15: patch main.yaml (IPs mortos / hostnames Swarm) ---
patch_main_yaml() {
  [[ ! -f "$CFG" ]] && return 0
  local tmp
  tmp=$(mktemp)
  cp "$CFG" "$tmp"

  sed -i "s|http://${BUILDER_HOST}:3000/|http://${BUILDER_IP}:3000/|g" "$tmp"
  sed -i "s|http://${BUILDER_HOST}:3000|http://${BUILDER_IP}:3000|g" "$tmp"
  sed -i "s|http://tasks\\.${BUILDER_HOST}:3000/|http://${BUILDER_IP}:3000/|g" "$tmp"
  sed -i "s|http://tasks\\.${BUILDER_HOST}:3000|http://${BUILDER_IP}:3000|g" "$tmp"

  if [[ -n "${VIEWER_IP:-}" ]]; then
    sed -i "s|http://${VIEWER_HOST}:3000/|http://${VIEWER_IP}:3000/|g" "$tmp"
    sed -i "s|http://${VIEWER_HOST}:3000|http://${VIEWER_IP}:3000|g" "$tmp"
    sed -i "s|http://tasks\\.${VIEWER_HOST}:3000/|http://${VIEWER_IP}:3000/|g" "$tmp"
    sed -i "s|http://tasks\\.${VIEWER_HOST}:3000|http://${VIEWER_IP}:3000|g" "$tmp"
  fi

  if ! cmp -s "$CFG" "$tmp"; then
    cp -a "$CFG" "${CFG}.bak-typebot-$(date +%Y%m%d-%H%M%S)"
    cp "$tmp" "$CFG"
    echo "  main.yaml atualizado (builder/viewer -> IP na rede ${NET})"
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  return 0
}

echo "--- Passo 15: main.yaml (se existir) ---"
YAML_CHANGED=0
if [[ -f "$CFG" ]]; then
  if ! patch_main_yaml; then
    YAML_CHANGED=1
  else
    echo "  main.yaml sem entradas builder/viewer para patch (rotas podem ser só no Easypanel dinâmico)"
  fi
else
  echo "  AVISO: ${CFG} não encontrado — rotas achpyp podem ser só no painel Easypanel"
fi

if [[ "$YAML_CHANGED" -eq 1 ]] || [[ "$TRAEFIK_BUILDER_OK" -eq 0 ]]; then
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
  docker restart "$TRAEFIK"
  sleep 10
  TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
fi
echo ""

# Re-teste público
echo "--- Reteste HTTPS builder ---"
BUILDER_PUBLIC=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 "$PUBLIC_BUILDER_SIGNIN" 2>/dev/null || echo "000")
echo "  -> HTTP ${BUILDER_PUBLIC}"

if [[ ! "$BUILDER_PUBLIC" =~ ^(200|307|302)$ ]]; then
  echo ""
  echo ">>> Ainda ${BUILDER_PUBLIC}. Passo 15 manual no Easypanel:"
  echo ">>> Domínios do builder: destino http://${BUILDER_IP}:3000/"
  echo ">>> (IP muda após service update --force; prefira hostname quando Traefik estiver na rede ${NET})"
fi
echo ""

# --- Passo 16: viewer + API ---
echo "--- Passo 16: viewer + API health ---"
VIEWER_PUBLIC=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 "$PUBLIC_VIEWER" 2>/dev/null || echo "000")
echo "  Viewer $PUBLIC_VIEWER -> HTTP ${VIEWER_PUBLIC}"

if command -v jq >/dev/null 2>&1; then
  curl -sS --max-time 12 "$API_HEALTH" 2>/dev/null | jq -r '
    "  API typebotBuilderReachable=\(.typebotBuilderReachable // "n/a") status=\(.typebotBuilderHttpStatus // "n/a")"
  ' 2>/dev/null || echo "  API health: (jq falhou)"
else
  echo "  Rode: curl -s $API_HEALTH"
fi

echo ""
echo "=== Fim ==="
echo "Guia: doc/TYPEBOT-ACESSO-E-502-HOJE.md"
