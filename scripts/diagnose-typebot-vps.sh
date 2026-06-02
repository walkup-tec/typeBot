#!/bin/bash
# Diagnóstico Typebot 502 no VPS (rodar como root no srv1261237)
# Uso: bash diagnose-typebot-vps.sh

set -euo pipefail

NET="${EASYPANEL_NET:-easypanel-typebot}"
BUILDER_FILTER="${BUILDER_FILTER:-typebot-walkup-builder}"
VIEWER_FILTER="${VIEWER_FILTER:-typebot-walkup-viewer}"
PUBLIC_SIGNIN="https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin"

echo "=== Typebot 502 — diagnóstico VPS ==="
echo "Data: $(date -Is)"
echo ""

container_id() {
  docker ps -aq -f "name=${1}" -f status=running | head -1
}

container_ip() {
  local cid="$1"
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}" 2>/dev/null \
    | grep -E '^[0-9]+\.' || true
}

probe_http() {
  local label="$1"
  local url="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  echo "  $label -> HTTP $code ($url)"
}

echo "--- 1) URL pública ---"
probe_http "Builder /signin (público)" "$PUBLIC_SIGNIN"
echo ""

echo "--- 2) Containers Docker (typebot) ---"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -i typebot || echo "  (nenhum container typebot encontrado)"
echo ""

BUILDER_CID=$(container_id "$BUILDER_FILTER")
VIEWER_CID=$(container_id "$VIEWER_FILTER")

if [[ -z "$BUILDER_CID" ]]; then
  echo "ERRO: container builder NÃO está Running (filtro: *${BUILDER_FILTER}*)"
  echo ""
  echo "Último container parado (logs):"
  STOPPED=$(docker ps -aq -f "name=${BUILDER_FILTER}" | head -1)
  if [[ -n "$STOPPED" ]]; then
    docker logs --tail 40 "$STOPPED" 2>&1 || true
  fi
  echo ""
  echo "Ação: Easypanel → typebot-walkup-builder → Start/Restart e ver Logs."
  exit 1
fi

BUILDER_NAME=$(docker inspect "$BUILDER_CID" --format '{{.Name}}' | sed 's/^\///')
BUILDER_IP=$(container_ip "$BUILDER_CID")

echo "Builder Running: $BUILDER_NAME ($BUILDER_CID)"
echo "IP em rede ${NET}: ${BUILDER_IP:-<sem IP nessa rede>}"
echo ""

echo "--- 3) Env crítico (builder) ---"
docker inspect "$BUILDER_CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(PORT|HOSTNAME|NODE_ENV|NEXTAUTH_URL|NEXT_PUBLIC_VIEWER_URL|DATABASE_URL|REDIS_URL|ENCRYPTION_SECRET)=' \
  | sed 's/ENCRYPTION_SECRET=.*/ENCRYPTION_SECRET=***/; s/DATABASE_URL=postgres:.*/DATABASE_URL=postgres:***@***/; s/REDIS_URL=.*/REDIS_URL=***/' || true
echo ""

echo "--- 4) Teste DENTRO do container (localhost:3000) ---"
if docker exec "$BUILDER_CID" wget -qO- --timeout=4 http://127.0.0.1:3000/signin >/dev/null 2>&1; then
  echo "  OK: app responde em 127.0.0.1:3000 dentro do container"
elif docker exec "$BUILDER_CID" curl -sS -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:3000/signin 2>/dev/null | grep -qE '^(200|307|302)'; then
  echo "  OK: app responde em 127.0.0.1:3000 (curl)"
else
  echo "  FALHA: app NÃO responde em 127.0.0.1:3000 — processo Next parado ou PORT errado"
  echo "  Verifique PORT=3000 e HOSTNAME=0.0.0.0 no Easypanel"
fi
echo ""

echo "--- 5) Teste pela rede Docker (${NET}) ---"
if [[ -n "$BUILDER_IP" ]]; then
  probe_http "Builder IP interno :3000/signin" "http://${BUILDER_IP}:3000/signin"
else
  echo "  AVISO: sem IP na rede ${NET} — proxy Easypanel pode não alcançar o container"
  echo "  Redes do container:"
  docker inspect "$BUILDER_CID" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{$v.IPAddress}}{{"\n"}}{{end}}'
fi
echo ""

echo "--- 6) Últimas linhas do log (builder) ---"
docker logs --tail 35 "$BUILDER_CID" 2>&1 || true
echo ""

if [[ -n "$VIEWER_CID" ]]; then
  VIEWER_IP=$(container_ip "$VIEWER_CID")
  echo "--- Viewer ---"
  echo "Running: $(docker inspect "$VIEWER_CID" --format '{{.Name}}' | sed 's/^\///')"
  if [[ -n "$VIEWER_IP" ]]; then
    probe_http "Viewer IP interno :3000" "http://${VIEWER_IP}:3000/"
  fi
  echo ""
fi

echo "=== Interpretação rápida ==="
echo "- App OK internamente + 502 público → Domínios Easypanel (porta 3000) ou proxy Traefik"
echo "- App FALHA em 127.0.0.1:3000 → env (REDIS/DB/ENCRYPTION) ou crash no start — ver logs acima"
echo "- Container não Running → Restart no Easypanel; subir db + redis antes"
echo ""
echo "Guia: doc/TYPEBOT-ACESSO-E-502-HOJE.md"
