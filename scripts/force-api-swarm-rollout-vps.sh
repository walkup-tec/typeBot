#!/bin/bash
# Força a task Swarm da API Easypanel a assumir a porta 3333 após deploy.
#
# Problema: build OK no Easypanel, mas task antiga segura host:3333
# (Pending: host-mode port already in use). /health fica com deployMarker antigo.
#
# Uso no VPS (root):
#   chmod +x /root/force-api-swarm-rollout-vps.sh
#   /root/force-api-swarm-rollout-vps.sh
#
# Só se marker ainda estiver antigo (passar marker esperado do último commit):
#   EXPECTED_MARKER='DEPLOY-2026-06-05-soma-dedupe-title-fix-v3' /root/force-api-swarm-rollout-vps.sh
#
# Diagnóstico sem alterar nada:
#   /root/force-api-swarm-rollout-vps.sh diagnose
#
# Após Easypanel "Implantar" na API, uma linha:
#   /root/force-api-swarm-rollout-vps.sh auto
set -euo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-https://app.chattypebot.com/health}"
EXPECTED_MARKER="${EXPECTED_MARKER:-}"
WAIT_SCALE_DOWN_SEC="${WAIT_SCALE_DOWN_SEC:-120}"
WAIT_SCALE_UP_SEC="${WAIT_SCALE_UP_SEC:-120}"
TRAEFIK_FIX="${TRAEFIK_FIX:-/root/traefik-permanent-vps.sh}"

log() { echo "[force-api-rollout] $*"; }

resolve_api_service() {
  local name
  name=$(docker service ls --format '{{.Name}}' 2>/dev/null | grep -E '^typebot_api$' | head -1 || true)
  if [[ -n "$name" ]]; then
    echo "$name"
    return 0
  fi
  name=$(docker service ls --format '{{.Name}}' 2>/dev/null | grep -E '^typebot_api-' | head -1 || true)
  if [[ -n "$name" ]]; then
    echo "$name"
    return 0
  fi
  name=$(
    docker service ls --format '{{.Name}}' 2>/dev/null \
      | grep -iE 'typebot.*(^|_)api' \
      | grep -viE 'crm|typebot-crm' \
      | head -1 || true
  )
  [[ -n "$name" ]] && echo "$name"
}

desired_replicas() {
  local svc="$1"
  local replicas want
  replicas=$(docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | awk -v s="$svc" '$1==s{print $2; exit}')
  want="${replicas#*/}"
  if [[ -z "$want" || "$want" == "0" ]]; then
    want=1
  fi
  echo "$want"
}

fetch_health_body() {
  local url body
  for url in \
    "$API_HEALTH_URL" \
    "http://127.0.0.1:3333/health" \
    "http://172.17.0.1:3333/health"; do
    [[ -z "$url" ]] && continue
    body=$(curl -sS --max-time 12 "$url" 2>/dev/null || true)
    if [[ -n "$body" && "$body" == *'"status"'* ]]; then
      echo "$body"
      return 0
    fi
  done
  return 1
}

health_marker() {
  local body
  body=$(fetch_health_body 2>/dev/null || true)
  [[ -z "$body" ]] && return 0
  grep -oE '"deployMarker":"[^"]+"' <<< "$body" \
    | head -1 \
    | sed 's/"deployMarker":"//;s/"$//' || true
}

has_pending_port_conflict() {
  local svc="$1"
  docker service ps "$svc" --no-trunc 2>/dev/null \
    | grep -qiE 'host-mode port already in use|no suitable node'
}

running_task_count() {
  local svc="$1"
  docker service ps "$svc" --filter desired-state=running --format '{{.CurrentState}}' 2>/dev/null \
    | grep -cE '^Running' || true
}

show_diagnose() {
  local svc="${1:-}"
  log "=== diagnose $(date -Is) ==="
  log "health: $API_HEALTH_URL"
  log "deployMarker atual: $(health_marker || echo '(indisponível)')"
  [[ -n "$EXPECTED_MARKER" ]] && log "deployMarker esperado: $EXPECTED_MARKER"
  if [[ -z "$svc" ]]; then
    log "ERRO: serviço API Swarm não encontrado (esperado typebot_api)"
    docker service ls 2>/dev/null | head -20 || true
    return 1
  fi
  log "serviço: $svc"
  docker service ls --format 'table {{.Name}}\t{{.Replicas}}\t{{.Image}}' 2>/dev/null | grep -F "$svc" || true
  echo "--- docker service ps $svc ---"
  docker service ps "$svc" --no-trunc 2>/dev/null | head -8 || true
  echo "--- porta 3333 no host ---"
  ss -tlnp 2>/dev/null | grep ':3333 ' || netstat -tlnp 2>/dev/null | grep ':3333 ' || true
  if has_pending_port_conflict "$svc"; then
    log "detectado: task Pending (porta 3333 em conflito)"
  fi
}

wait_until_scaled_down() {
  local svc="$1"
  local deadline=$((SECONDS + WAIT_SCALE_DOWN_SEC))
  while (( SECONDS < deadline )); do
    local running
    running=$(running_task_count "$svc")
    if [[ "${running:-0}" -eq 0 ]]; then
      log "scale down OK (0 tasks Running)"
      return 0
    fi
    sleep 3
  done
  log "AVISO: timeout aguardando scale down (ainda há tasks Running)"
  return 1
}

wait_until_running() {
  local svc="$1"
  local want="$2"
  local deadline=$((SECONDS + WAIT_SCALE_UP_SEC))
  while (( SECONDS < deadline )); do
    local replicas
    replicas=$(docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | awk -v s="$svc" '$1==s{print $2; exit}')
    if [[ "$replicas" == "${want}/${want}" ]]; then
      local pending
      pending=$(docker service ps "$svc" --filter desired-state=running --format '{{.CurrentState}}' 2>/dev/null | grep -c Pending || true)
      if [[ "${pending:-0}" -eq 0 ]] && [[ "$(running_task_count "$svc")" -ge 1 ]]; then
        log "scale up OK (réplicas ${replicas})"
        return 0
      fi
    fi
    sleep 4
  done
  log "AVISO: timeout aguardando scale up"
  return 1
}

rollout_service() {
  local svc="$1"
  local want
  want=$(desired_replicas "$svc")

  log ">>> docker service scale ${svc}=0"
  docker service scale "${svc}=0"
  wait_until_scaled_down "$svc" || true
  sleep 2

  log ">>> docker service scale ${svc}=${want}"
  docker service scale "${svc}=${want}"
  wait_until_running "$svc" "$want" || true
  sleep 5
}

verify_health() {
  local marker tries=0
  while (( tries < 8 )); do
    marker=$(health_marker || true)
    if [[ -n "$marker" ]]; then
      log "deployMarker após rollout: $marker"
      if [[ -n "$EXPECTED_MARKER" && "$marker" != "$EXPECTED_MARKER" ]]; then
        tries=$((tries + 1))
        sleep 4
        continue
      fi
      if fetch_health_body 2>/dev/null | grep -q '"status":"ok"'; then
        log "health OK"
        return 0
      fi
    fi
    tries=$((tries + 1))
    sleep 4
  done
  if [[ -n "$EXPECTED_MARKER" ]]; then
    log "ERRO: marker ainda não é '$EXPECTED_MARKER' (atual: '${marker:-?}')"
    return 1
  fi
  log "health respondeu (marker: ${marker:-?})"
  return 0
}

maybe_traefik_fix() {
  if [[ ! -x "$TRAEFIK_FIX" ]]; then
    return 0
  fi
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 "$API_HEALTH_URL" 2>/dev/null || echo "000")
  if [[ "$code" == "502" || "$code" == "000" ]]; then
    log "API $code — executando $TRAEFIK_FIX run"
    "$TRAEFIK_FIX" run || true
  fi
}

should_rollout() {
  local svc="$1"
  local mode="${2:-run}"

  if [[ "$mode" == "run" ]]; then
    return 0
  fi

  if has_pending_port_conflict "$svc"; then
    log "auto: Pending por porta 3333"
    return 0
  fi

  local body current
  body=$(fetch_health_body 2>/dev/null || true)
  if [[ -z "$body" ]]; then
    log "auto: health inacessível (público e 127.0.0.1:3333)"
    return 0
  fi
  current=$(health_marker || true)
  if [[ -n "$EXPECTED_MARKER" && "$current" != "$EXPECTED_MARKER" ]]; then
    log "auto: marker '$current' != esperado '$EXPECTED_MARKER'"
    return 0
  fi

  local running pending
  running=$(running_task_count "$svc")
  pending=$(docker service ps "$svc" --format '{{.CurrentState}}' 2>/dev/null | grep -c Pending || true)
  if [[ "${running:-0}" -ge 1 && "${pending:-0}" -ge 1 ]]; then
    log "auto: task Running + Pending simultâneas"
    return 0
  fi

  return 1
}

main() {
  local mode="${1:-run}"
  local svc
  svc=$(resolve_api_service || true)

  if [[ "$mode" == "diagnose" ]]; then
    show_diagnose "$svc"
    exit 0
  fi

  if [[ -z "$svc" ]]; then
    log "ERRO: serviço typebot_api não encontrado"
    exit 1
  fi

  show_diagnose "$svc"

  if [[ "$mode" == "auto" ]] && ! should_rollout "$svc" "$mode"; then
    local marker_ok
    marker_ok=$(health_marker || true)
    if [[ -n "$marker_ok" ]]; then
      log "auto: nada a fazer — task OK, deployMarker=$marker_ok"
    else
      log "auto: task Swarm OK mas health sem marker — rode: $0 diagnose"
    fi
    exit 0
  fi

  rollout_service "$svc"
  maybe_traefik_fix
  verify_health
  log "concluído"
}

main "${1:-run}"
