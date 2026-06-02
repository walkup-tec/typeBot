#!/bin/bash
# Fix consolidado migração soma → walkup: Traefik (IPs Swarm) + auditoria MinIO/S3/DB/Redis
# Uso: bash fix-typebot-migracao-walkup-completo-vps.sh

set -euo pipefail

NET="${EASYPANEL_NET:-easypanel-typebot}"
CFG="${TRAEFIK_CFG:-/etc/easypanel/traefik/config/main.yaml}"

echo "=== Typebot migração walkup — fix completo VPS ==="
echo "Data: $(date -Is)"
echo ""

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

patch_traefik_service() {
  local host_pattern="$1"
  local ip="$2"
  [[ -z "$ip" ]] && return 0
  [[ ! -f "$CFG" ]] && return 0
  sed -i "s|http://${host_pattern}:3000|http://${ip}:3000|g" "$CFG"
  sed -i "s|http://tasks\\.${host_pattern}:3000|http://${ip}:3000|g" "$CFG"
  sed -i "s|http://${host_pattern}:9000|http://${ip}:9000|g" "$CFG"
  sed -i "s|http://tasks\\.${host_pattern}:9000|http://${ip}:9000|g" "$CFG"
}

BUILDER_IP=$(container_ip typebot-walkup-builder || true)
VIEWER_IP=$(container_ip typebot-walkup-viewer || true)
MINIO_IP=$(container_ip minio || true)
DB_IP=$(container_ip typebot-walkup-db || true)
REDIS_IP=$(container_ip typebot-walkup-redis || true)

echo "--- IPs rede ${NET} ---"
echo "  DB=${DB_IP:-<off>} REDIS=${REDIS_IP:-<off>}"
echo "  BUILDER=${BUILDER_IP:-<off>} VIEWER=${VIEWER_IP:-<off>} MINIO=${MINIO_IP:-<off>}"
echo ""

TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
if [[ -n "$TRAEFIK" ]]; then
  echo "--- Traefik: rede + main.yaml (somente ${CFG}) ---"
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
  if [[ -f "$CFG" ]]; then
    cp -a "$CFG" "${CFG}.bak-walkup-$(date +%Y%m%d-%H%M%S)"
    patch_traefik_service "typebot_typebot-walkup-builder" "$BUILDER_IP"
    patch_traefik_service "typebot_typebot-walkup-viewer" "$VIEWER_IP"
    patch_traefik_service "typebot_minio" "$MINIO_IP"
    echo "  main.yaml atualizado (builder/viewer/minio -> IP)"
  fi
  echo ""
fi

echo "--- Testes HTTPS ---"
curl -sS -o /dev/null -w "  builder-signin:%{http_code}\n" --max-time 12 \
  https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin || echo "  builder-signin:000"
curl -sS -o /dev/null -w "  viewer-root:%{http_code}\n" --max-time 12 \
  https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/ || echo "  viewer-root:000"
curl -sS -o /dev/null -w "  minio-health:%{http_code}\n" --max-time 12 \
  https://typebot-minio.achpyp.easypanel.host/minio/health/live || echo "  minio-health:000"
echo ""

audit_env() {
  local name="$1"
  local cid
  cid=$(docker ps -q -f "name=${name}" -f status=running | head -1)
  [[ -z "$cid" ]] && { echo "  [$name] container off"; return; }
  echo "  === $name ==="
  local env
  env=$(docker inspect "$cid" --format '{{range .Config.Env}}{{println .}}{{end}}')
  echo "$env" | grep -E '^(DATABASE_URL|REDIS_URL|S3_|SMTP_HOST|NEXTAUTH_URL|NEXT_PUBLIC_VIEWER|S3_PUBLIC)=' \
    | sed 's/\(PASSWORD=\).*/\1***/; s/SECRET_KEY=.*/SECRET_KEY=***/; s/REDIS_URL=redis:\/\/:[^@]*/REDIS_URL=redis:\/\/***/; s/DATABASE_URL=postgresql:\/\/postgres:[^@]*/DATABASE_URL=postgresql:\/\/postgres:***/' || true

  echo "$env" | grep '^S3_ACCESS_KEY=' | grep -q '@' && \
    echo "  >>> ERRO: S3_ACCESS_KEY contém @ — use typebotstorage (ver doc/TYPEBOT-MIGRACAO-WALKUP-FIX-COMPLETO.md)"
  echo "$env" | grep -q '^S3_PUBLIC_CUSTOM_DOMAIN=' && \
    echo "  >>> AVISO: remover S3_PUBLIC_CUSTOM_DOMAIN (causou 500 no builder)"
  echo "$env" | grep '^DATABASE_URL=' | grep -q 'typebot_typebot-walkup-db' && \
    echo "  >>> AVISO: DATABASE_URL usa hostname — preferir IP ${DB_IP:-?} (DNS Swarm morto)"
  echo "$env" | grep '^REDIS_URL=' | grep -qE '@typebot_typebot-walkup-redis|@10\.11\.' && \
    echo "  >>> AVISO: REDIS_URL hostname ou rede 10.11.x — preferir IP ${REDIS_IP:-?}"
  echo "$env" | grep '^S3_ENDPOINT=' | grep -q 'https://' && \
    echo "  >>> ERRO: S3_ENDPOINT não deve ter https://"
  echo ""
}

echo "--- Auditoria env (builder / viewer) ---"
audit_env typebot-walkup-builder
audit_env typebot-walkup-viewer

echo "--- Sugestão DATABASE_URL / REDIS_URL (colar no Easypanel) ---"
if [[ -n "${DB_IP:-}" ]]; then
  echo "  DATABASE_URL=postgresql://postgres:<SENHA_DB>@${DB_IP}:5432/typebot"
fi
if [[ -n "${REDIS_IP:-}" ]]; then
  echo "  REDIS_URL=redis://:<SENHA_REDIS>@${REDIS_IP}:6379"
fi
echo ""
echo "  S3 (builder+viewer): S3_ENDPOINT=typebot-minio.achpyp.easypanel.host S3_PORT=443 S3_SSL=true"
echo "  S3_ACCESS_KEY=typebotstorage S3_SECRET_KEY=<do-console-minio> S3_BUCKET=typebot"
echo ""
echo "Guia: doc/TYPEBOT-MIGRACAO-WALKUP-FIX-COMPLETO.md"
echo "=== Fim ==="
