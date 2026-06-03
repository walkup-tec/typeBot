#!/bin/bash
# Corrige Traefik Easypanel: LP, painel, API, Typebot builder/viewer, MinIO.
# Instalação permanente: scripts/traefik-permanent-vps.sh install
# NUNCA: sed global em 10.0.4.*:3000 (quebra LP/painel).
set -euo pipefail

if [[ -x /root/traefik-permanent-vps.sh ]]; then
  exec /root/traefik-permanent-vps.sh run
fi

CFG=/etc/easypanel/traefik/config/main.yaml
NET=easypanel-typebot
TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)

if [[ -z "$TRAEFIK" ]]; then
  echo "ERRO: Traefik não está Running"
  exit 1
fi

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

LP_IP=$(container_ip paginadevendas || true)
PAINEL_IP=$(container_ip painel-typebot-crm || container_ip painel || true)
BUILDER_IP=$(container_ip typebot-walkup-builder || true)
VIEWER_IP=$(container_ip typebot-walkup-viewer || true)
MINIO_IP=$(container_ip minio || true)

[[ -z "$LP_IP" || -z "$PAINEL_IP" ]] && {
  echo "ERRO: paginadevendas ou painel sem IP na rede ${NET}"
  exit 1
}

echo "=== fix-traefik $(date -Is) ==="
echo "LP=${LP_IP} PAINEL=${PAINEL_IP} BUILDER=${BUILDER_IP:-off} VIEWER=${VIEWER_IP:-off} MINIO=${MINIO_IP:-off}"

cp -a "$CFG" "${CFG}.bak-$(date +%Y%m%d-%H%M%S)"

python3 - "$CFG" "$LP_IP" "$PAINEL_IP" "${BUILDER_IP:-}" "${VIEWER_IP:-}" "${MINIO_IP:-}" <<'PY'
import re, sys
path, lp, painel, builder, viewer, minio = sys.argv[1:7]
text = open(path, encoding="utf-8").read()

def fix_service(name: str, ip: str, port: str = "3000") -> int:
    global text
    if not ip:
        return 0
    pat = rf'("{re.escape(name)}"\s*:\s*\{{[\s\S]*?"url"\s*:\s*")[^"]+(")'
    text, n = re.subn(pat, rf'\g<1>http://{ip}:{port}/\2', text, count=1)
    if n:
        print(f"  {name} -> http://{ip}:{port}/")
    return n

for svc, ip in [
    ("typebot_paginadevendas-1", lp),
    ("typebot_paginadevendas-0", lp),
    ("typebot_painel-typebot-crm-0", painel),
    ("typebot_typebot-walkup-builder-0", builder),
    ("typebot_typebot-walkup-viewer-0", viewer),
    ("typebot_minio-0", minio),
    ("typebot_minio", minio),
]:
    fix_service(svc, ip)

for host, ip, port in [
    ("typebot_paginadevendas", lp, "3000"),
    ("typebot_painel-typebot-crm", painel, "3000"),
    ("typebot_typebot-walkup-builder", builder, "3000"),
    ("typebot_typebot-walkup-viewer", viewer, "3000"),
    ("typebot_minio", minio, "9000"),
]:
    if not ip:
        continue
    for prefix in ("", "tasks."):
        old = f"http://{prefix}{host}:{port}"
        new = f"http://{ip}:{port}"
        text = text.replace(old + "/", new + "/")
        text = text.replace(old, new)

text = re.sub(r'http://typebot_api[^"]*', "http://172.17.0.1:3333", text)
text = re.sub(r"http://172\.17\.0\.1:3000/?", f"http://{lp}:3000/", text)

# LP/painel apontando para IP do builder por sed errado anterior
if builder and builder != lp:
    text = re.sub(
        rf'("typebot_paginadevendas[^"]*"\s*:\s*\{{[\s\S]*?"url"\s*:\s*")http://{re.escape(builder)}:3000/?(")',
        rf"\g<1>http://{lp}:3000/\2",
        text,
    )
if builder and builder != painel:
    text = re.sub(
        rf'("typebot_painel[^"]*"\s*:\s*\{{[\s\S]*?"url"\s*:\s*")http://{re.escape(builder)}:3000/?(")',
        rf"\g<1>http://{painel}:3000/\2",
        text,
    )

open(path, "w", encoding="utf-8").write(text)
print("main.yaml OK")
PY

connect_traefik_networks() {
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
}

connect_traefik_networks

traefik_reaches_lp() {
  docker exec "$TRAEFIK" wget -qO- --timeout=5 "http://${LP_IP}:3000/" >/dev/null 2>&1
}

LP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --resolve chattypebot.com:443:127.0.0.1 --max-time 12 \
  https://chattypebot.com/ 2>/dev/null || echo "000")

if [[ "$LP_CODE" == "502" || "$LP_CODE" == "000" ]] || ! traefik_reaches_lp; then
  echo "LP ${LP_CODE} ou Traefik sem rota — reiniciando Traefik uma vez"
  docker restart "$TRAEFIK"
  sleep 10
  TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  connect_traefik_networks
fi

curl -sS -o /dev/null -w "lp:%{http_code} " --resolve chattypebot.com:443:127.0.0.1 --max-time 12 \
  https://chattypebot.com/ 2>/dev/null || echo -n "lp:000 "
curl -sS -o /dev/null -w "painel:%{http_code} " --resolve painel.chattypebot.com:443:127.0.0.1 --max-time 12 \
  https://painel.chattypebot.com/ 2>/dev/null || echo -n "painel:000 "
curl -sS -o /dev/null -w "app:%{http_code}\n" --resolve app.chattypebot.com:443:127.0.0.1 --max-time 12 \
  https://app.chattypebot.com/health 2>/dev/null || echo "app:000"
