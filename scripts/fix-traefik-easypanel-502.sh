#!/bin/bash
# Estabiliza proxy Traefik (Easypanel + Swarm): API, LP e Painel.
# Só reinicia Traefik se main.yaml mudar (evita queda desnecessária).
# Uso: bash /root/fix-traefik-easypanel-502.sh

set -euo pipefail

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
PAINEL_IP=$(container_ip painel-typebot-crm || true)

[[ -z "$LP_IP" ]] && { echo "ERRO: paginadevendas sem IP em ${NET}"; exit 1; }
[[ -z "$PAINEL_IP" ]] && { echo "ERRO: painel sem IP em ${NET}"; exit 1; }

echo "LP=${LP_IP} PAINEL=${PAINEL_IP} API=172.17.0.1:3333"

TMP=$(mktemp)
cp "$CFG" "$TMP"

sed -i 's|http://typebot_api[^"]*|http://172.17.0.1:3333|g' "$TMP"
sed -i "s|http://typebot_paginadevendas:3000/|http://${LP_IP}:3000/|g" "$TMP"
sed -i "s|http://typebot_paginadevendas:3000|http://${LP_IP}:3000|g" "$TMP"
sed -i "s|http://tasks\.typebot_paginadevendas:3000/|http://${LP_IP}:3000/|g" "$TMP"
sed -i "s|http://tasks\.typebot_paginadevendas:3000|http://${LP_IP}:3000|g" "$TMP"
sed -i 's|http://172\.17\.0\.1:3000/|http://'"${LP_IP}"':3000/|g' "$TMP"
sed -i 's|http://172\.17\.0\.1:3000|http://'"${LP_IP}"':3000|g' "$TMP"
sed -i "s|http://typebot_painel-typebot-crm:3000/|http://${PAINEL_IP}:3000/|g" "$TMP"
sed -i "s|http://typebot_painel-typebot-crm:3000|http://${PAINEL_IP}:3000|g" "$TMP"
sed -i "s|http://tasks\.typebot_painel-typebot-crm:3000/|http://${PAINEL_IP}:3000/|g" "$TMP"
sed -i "s|http://tasks\.typebot_painel-typebot-crm:3000|http://${PAINEL_IP}:3000|g" "$TMP"

# chattypebot.com usa serviço typebot_paginadevendas-1 (não bate nos sed acima)
python3 - "$TMP" "$LP_IP" <<'PY'
import re, sys
path, lp = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
new, n = re.subn(
    r'("typebot_paginadevendas-1"\s*:\s*\{[^}]*?"loadBalancer"\s*:\s*\{[^}]*?"servers"\s*:\s*\[\s*\{\s*"url"\s*:\s*")[^"]+(")',
    rf'\g<1>http://{lp}:3000/\2',
    text,
    count=1,
    flags=re.S,
)
open(path, "w", encoding="utf-8").write(new)
if n:
    print(f"typebot_paginadevendas-1 -> http://{lp}:3000/")
PY

CHANGED=0
if ! cmp -s "$CFG" "$TMP"; then
  cp -a "$CFG" "${CFG}.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$TMP" "$CFG"
  CHANGED=1
  echo "main.yaml atualizado"
else
  echo "main.yaml já OK — sem alteração"
fi
rm -f "$TMP"

connect_traefik_networks() {
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
}

connect_traefik_networks

traefik_reaches_lp() {
  docker exec "$TRAEFIK" wget -qO- --timeout=4 "http://${LP_IP}:3000/" >/dev/null 2>&1
}

if [[ "$CHANGED" -eq 1 ]] || ! traefik_reaches_lp; then
  [[ "$CHANGED" -eq 0 ]] && echo "main.yaml inalterado mas Traefik não alcança LP — reiniciando Traefik"
  docker restart "$TRAEFIK"
  sleep 8
  TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  connect_traefik_networks
fi

if ! traefik_reaches_lp; then
  echo "AVISO: Traefik ainda não alcança http://${LP_IP}:3000/ — verifique rede ${NET}"
  docker exec "$TRAEFIK" wget -S -O- --timeout=4 "http://${LP_IP}:3000/" 2>&1 | head -5 || true
fi

# Teste via localhost (evita falha de hairpin no próprio VPS)
LP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --resolve chattypebot.com:443:127.0.0.1 --max-time 10 \
  https://chattypebot.com/ || echo "000")

if [[ "$LP_CODE" == "502" || "$LP_CODE" == "000" ]]; then
  echo "lp:${LP_CODE} — tentando fix typebot_paginadevendas-1"
  python3 - "$CFG" "$LP_IP" <<'PY'
import re, sys
path, lp = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
new, n = re.subn(
    r'("typebot_paginadevendas-1"\s*:\s*\{[^}]*?"loadBalancer"\s*:\s*\{[^}]*?"servers"\s*:\s*\[\s*\{\s*"url"\s*:\s*")[^"]+(")',
    rf'\g<1>http://{lp}:3000/\2',
    text,
    count=1,
    flags=re.S,
)
if n:
    open(path, "w", encoding="utf-8").write(new)
    print(f"fix aplicado: typebot_paginadevendas-1 -> http://{lp}:3000/")
PY
  docker restart "$TRAEFIK"
  sleep 8
  connect_traefik_networks
fi

curl -sS -o /dev/null -w "app:%{http_code} " --resolve app.chattypebot.com:443:127.0.0.1 --max-time 10 \
  https://app.chattypebot.com/health
curl -sS -o /dev/null -w "lp:%{http_code} " --resolve chattypebot.com:443:127.0.0.1 --max-time 10 \
  https://chattypebot.com/
curl -sS -o /dev/null -w "painel:%{http_code}\n" --resolve painel.chattypebot.com:443:127.0.0.1 --max-time 10 \
  https://painel.chattypebot.com/
