#!/bin/bash
# Diagnostico rapido: LP/painel 502 apos redeploy Easypanel.
# Uso no VPS (root): bash diagnose-502-lp-painel-vps.sh
set -uo pipefail

NET=easypanel-typebot
CFG=/etc/easypanel/traefik/config/main.yaml

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  echo "$cid $(docker inspect "$cid" --format '{{.Names}}')"
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

echo "=== $(date -Is) diagnose 502 LP/painel ==="
echo ""

echo "--- Servicos Swarm (typebot) ---"
docker service ls 2>/dev/null | grep -i typebot || docker ps --format 'table {{.Names}}\t{{.Status}}' | head -20

echo ""
echo "--- Containers pagina / painel / traefik ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -iE 'pagina|painel|traefik|typebot_api|typebot_api-' || true

echo ""
echo "--- IP na rede ${NET} ---"
LP_CID="" LP_IP="" PAINEL_CID="" PAINEL_IP=""
while read -r line; do
  [[ -z "$line" ]] && continue
  echo "paginadevendas: $line"
  LP_CID=$(echo "$line" | awk '{print $1}')
  LP_IP=$(echo "$line" | awk '{print $3}')
done < <(container_ip paginadevendas 2>/dev/null | paste - - || true)

while read -r line; do
  [[ -z "$line" ]] && continue
  echo "painel-typebot-crm: $line"
  PAINEL_CID=$(echo "$line" | awk '{print $1}')
  PAINEL_IP=$(echo "$line" | awk '{print $3}')
done < <(container_ip painel-typebot-crm 2>/dev/null | paste - - || true)

if [[ -z "$PAINEL_IP" ]]; then
  while read -r line; do
    [[ -z "$line" ]] && continue
    echo "painel: $line"
    PAINEL_CID=$(echo "$line" | awk '{print $1}')
    PAINEL_IP=$(echo "$line" | awk '{print $3}')
  done < <(container_ip painel 2>/dev/null | paste - - || true)
fi

[[ -z "$LP_IP" ]] && echo "ERRO: paginadevendas sem IP em ${NET} (servico parado ou rede errada)"
[[ -z "$PAINEL_IP" ]] && echo "ERRO: painel sem IP em ${NET} (servico parado ou rede errada)"

TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
echo ""
echo "--- Traefik: ${TRAEFIK:-AUSENTE} ---"
if [[ -n "$TRAEFIK" ]]; then
  docker inspect "$TRAEFIK" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -E 'easypanel|typebot' || echo "Traefik pode estar fora das redes overlay"
fi

probe() {
  local label="$1" url="$2"
  echo -n "${label}: "
  if [[ -z "$TRAEFIK" ]]; then
    echo "skip (sem traefik)"
    return
  fi
  if docker exec "$TRAEFIK" wget -qO- -T 6 "$url" 2>/dev/null | head -c 60 | tr '\n' ' '; then
    echo ""
  else
    echo "FALHOU ($url)"
  fi
}

echo ""
echo "--- Teste HTTP de DENTRO do Traefik ---"
[[ -n "$LP_IP" ]] && probe "LP" "http://${LP_IP}:3000/"
[[ -n "$PAINEL_IP" ]] && probe "PAINEL" "http://${PAINEL_IP}:3000/"
probe "API host" "http://172.17.0.1:3333/health"

echo ""
echo "--- Teste HTTPS publico (localhost) ---"
for host in chattypebot.com painel.chattypebot.com app.chattypebot.com; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --resolve "${host}:443:127.0.0.1" --max-time 10 "https://${host}/" 2>/dev/null || echo "000")
  echo "${host} -> ${code}"
done

echo ""
echo "--- Trechos main.yaml (LP/painel) ---"
if [[ -f "$CFG" ]]; then
  grep -n -E 'chattypebot|painel\.chattypebot|paginadevendas|painel-typebot|typebot_painel' "$CFG" | head -35
else
  echo "ERRO: ${CFG} nao existe"
fi

echo ""
echo "=== Fim diagnose ==="
echo "Se 'FALHOU' no wget interno: redeploy paginadevendas + painel no Easypanel (Running)."
echo "Se wget OK mas HTTPS 502: /root/traefik-permanent-vps.sh run && docker restart \$(docker ps -q -f name=traefik | head -1)"
