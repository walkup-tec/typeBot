#!/bin/bash
# Diagnostico rapido: LP/painel 502 apos redeploy Easypanel.
# Uso no VPS (root): bash diagnose-502-lp-painel-vps.sh
set -uo pipefail

NET=easypanel-typebot
CFG=/etc/easypanel/traefik/config/main.yaml

overlay_ip() {
  local filter="$1"
  local cid ip
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  ip=$(docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}")
  [[ -z "$ip" ]] && return 1
  printf '%s %s\n' "$cid" "$ip"
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
LP_CID="" LP_IP="" PAINEL_CID="" PAINEL_IP="" BUILDER_IP=""
read -r LP_CID LP_IP <<< "$(overlay_ip paginadevendas 2>/dev/null || true)"
read -r PAINEL_CID PAINEL_IP <<< "$(overlay_ip painel-typebot-crm 2>/dev/null || overlay_ip painel 2>/dev/null || true)"
read -r _ BUILDER_IP <<< "$(overlay_ip typebot-walkup-builder 2>/dev/null || true)"

[[ -n "$LP_CID" ]] && echo "paginadevendas: ${LP_CID} ${LP_IP}"
[[ -n "$PAINEL_CID" ]] && echo "painel: ${PAINEL_CID} ${PAINEL_IP}"
[[ -n "$BUILDER_IP" ]] && echo "builder: ${BUILDER_IP}"

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
  if docker exec "$TRAEFIK" wget -qO- -T 8 "$url" 2>/dev/null | head -c 80 | tr '\n' ' '; then
    echo ""
  else
    echo "FALHOU ($url)"
  fi
}

host_probe() {
  local label="$1" url="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 "$url" 2>/dev/null || echo "000")
  echo "${label} (host direto): ${code} (${url})"
}

echo ""
echo "--- Teste HTTP de DENTRO do Traefik ---"
[[ -n "$LP_IP" ]] && probe "LP" "http://${LP_IP}:3000/"
[[ -n "$PAINEL_IP" ]] && probe "PAINEL" "http://${PAINEL_IP}:3000/"
[[ -n "$BUILDER_IP" ]] && probe "BUILDER" "http://${BUILDER_IP}:3000/signin"
probe "API host" "http://172.17.0.1:3333/health"

echo ""
echo "--- Teste HTTP do HOST (sem Traefik) ---"
[[ -n "$LP_IP" ]] && host_probe "LP" "http://${LP_IP}:3000/"
[[ -n "$PAINEL_IP" ]] && host_probe "PAINEL" "http://${PAINEL_IP}:3000/"
[[ -n "$BUILDER_IP" ]] && host_probe "BUILDER" "http://${BUILDER_IP}:3000/signin"

echo ""
echo "--- Teste HTTPS publico (localhost) ---"
for host in chattypebot.com painel.chattypebot.com app.chattypebot.com; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --resolve "${host}:443:127.0.0.1" --max-time 10 "https://${host}/" 2>/dev/null || echo "000")
  echo "${host} -> ${code}"
done

echo ""
echo "--- URLs upstream no main.yaml (LP/painel/builder) ---"
if [[ -f "$CFG" ]]; then
  for svc in typebot_paginadevendas-1 typebot_paginadevendas-0 typebot_painel-typebot-crm-0 typebot_typebot-walkup-builder-0; do
    url=$(python3 - "$CFG" "$svc" <<'PY'
import json, sys
path, name = sys.argv[1:3]
data = json.load(open(path))
url = data.get("http", {}).get("services", {}).get(name, {}).get("loadBalancer", {}).get("servers", [{}])[0].get("url", "")
print(url or "(ausente)")
PY
)
    echo "${svc} -> ${url}"
  done
else
  echo "ERRO: ${CFG} nao existe"
fi

echo ""
echo "=== Fim diagnose ==="
echo "wget FALHOU + host direto FALHOU -> app nao responde :3000 (logs Easypanel paginadevendas/painel)."
echo "host OK + wget FALHOU -> Traefik fora da rede overlay (ensure_traefik_on_overlay)."
echo "wget OK + HTTPS 502 -> main.yaml/router errado ou Traefik precisa restart."
