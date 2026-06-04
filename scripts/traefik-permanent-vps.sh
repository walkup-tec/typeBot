#!/bin/bash
# Solução PERMANENTE Traefik + Easypanel + Swarm (LP/painel/API/Typebot/MinIO).
#
# Instalação única no VPS:
#   curl -sSL .../traefik-permanent-vps.sh -o /root/traefik-permanent-vps.sh
#   chmod +x /root/traefik-permanent-vps.sh
#   /root/traefik-permanent-vps.sh install
#
# Após `install` (uma vez no VPS): correção 100% automática — sem comando manual por deploy.
# - systemd watch: docker events (start/die/destroy/service update)
# - systemd timer: patch a cada 20s (backup)
# - cron: backup minuto a minuto
set -euo pipefail

INSTALL_PATH="/root/traefik-permanent-vps.sh"
CRON_FILE="/etc/cron.d/traefik-permanent-fix"
LOG="/var/log/traefik-permanent-fix.log"
LOCK_FILE="/var/run/traefik-permanent-fix.lock"
CFG=/etc/easypanel/traefik/config/main.yaml
NET=easypanel-typebot
WATCH_SERVICE="traefik-permanent-watch.service"
TIMER_SERVICE="traefik-permanent-fix.timer"
WATCH_UNIT_PATH="/etc/systemd/system/${WATCH_SERVICE}"
TIMER_UNIT_PATH="/etc/systemd/system/${TIMER_SERVICE}"
TIMER_SERVICE_UNIT="/etc/systemd/system/traefik-permanent-fix.service"

script_path() {
  if [[ -n "${1:-}" && -x "${1}" ]]; then
    echo "${1}"
    return
  fi
  if [[ -x "${INSTALL_PATH}" ]]; then
    echo "${INSTALL_PATH}"
    return
  fi
  readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}"
}

container_ip() {
  local filter="$1"
  local cid
  # Após redeploy o IP muda: usar o container mais recente (evita Traefik apontar para task morta).
  cid=$(
    docker ps -q -f "name=${filter}" -f status=running \
      | xargs -r docker inspect --format '{{.Created}} {{.Id}}' 2>/dev/null \
      | sort -r \
      | head -1 \
      | awk '{print $2}'
  )
  [[ -z "$cid" ]] && cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

# Easypanel pode nomear o serviço como painel-typebot-crm ou painel
resolve_painel_ip() {
  container_ip painel-typebot-crm || container_ip painel || return 1
}

traefik_container() {
  docker ps -q -f name=easypanel-traefik -f status=running | head -1
}

traefik_swarm_service() {
  local cid svc
  cid=$(traefik_container)
  [[ -z "$cid" ]] && return 1
  svc=$(docker inspect "$cid" --format '{{index .Config.Labels "com.docker.swarm.service.name"}}' 2>/dev/null || true)
  [[ -n "$svc" && "$svc" != "<no value>" ]] && echo "$svc" && return 0
  docker service ls --format '{{.Name}}' 2>/dev/null | grep -iE 'traefik' | head -1
}

ensure_traefik_on_overlay() {
  local traefik svc
  traefik=$(traefik_container)
  [[ -z "$traefik" ]] && { echo "ERRO: Traefik container ausente"; return 1; }

  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$traefik" 2>/dev/null || true
  done

  svc=$(traefik_swarm_service || true)
  if [[ -n "${svc:-}" ]]; then
    local net_id on_net update_out
    net_id=$(docker network ls -q -f name="^${NET}$" | head -1)
    on_net=0
    if [[ -n "$net_id" ]]; then
      docker service inspect "$svc" --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}}{{println}}{{end}}' 2>/dev/null \
        | grep -qx "$net_id" && on_net=1
    fi
    if [[ "$on_net" -eq 1 ]]; then
      echo "Swarm: serviço ${svc} já na rede ${NET}"
    else
      echo "Swarm: adicionando rede ${NET} ao serviço ${svc} (permanente)"
      update_out=$(timeout 45 docker service update --network-add "$NET" "$svc" 2>&1) || true
      if grep -qiE 'already attached|is already attached' <<<"$update_out"; then
        echo "Swarm: rede ${NET} já estava no serviço ${svc}"
      elif [[ -n "$update_out" ]]; then
        echo "$update_out"
      fi
    fi
  fi
}

patch_main_yaml() {
  local lp_ip painel_ip builder_ip viewer_ip minio_ip
  lp_ip=$(container_ip paginadevendas || true)
  painel_ip=$(resolve_painel_ip || true)
  builder_ip=$(container_ip typebot-walkup-builder || true)
  viewer_ip=$(container_ip typebot-walkup-viewer || true)
  minio_ip=$(container_ip minio || true)

  [[ -z "$lp_ip" || -z "$painel_ip" ]] && {
    echo "ERRO: LP ou painel sem IP em ${NET}"
    return 1
  }

  [[ -f "$CFG" ]] || { echo "ERRO: ${CFG} não existe"; return 1; }

  local before after
  before=$(mktemp)
  after=$(mktemp)
  cp "$CFG" "$before"

  python3 - "$CFG" "$lp_ip" "$painel_ip" "${builder_ip:-}" "${viewer_ip:-}" "${minio_ip:-}" <<'PY'
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
    ("typebot_painel-0", painel),
    ("typebot_painel-1", painel),
    ("typebot_typebot-walkup-builder-0", builder),
    ("typebot_typebot-typebot-walkup-builder-0", builder),
    ("typebot_typebot-walkup-viewer-0", viewer),
    ("typebot_typebot-typebot-walkup-viewer-0", viewer),
    ("typebot_minio-0", minio),
    ("typebot_minio", minio),
]:
    fix_service(svc, ip)

for host, ip, port in [
    ("typebot_paginadevendas", lp, "3000"),
    ("typebot_painel-typebot-crm", painel, "3000"),
    ("typebot_painel", painel, "3000"),
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

def fix_host_windows(host_needle, wrong_ips, correct_ip, wrong_services, correct_service, port="3000"):
    global text
    lines = text.splitlines(keepends=True)
    i = 0
    changed = 0
    while i < len(lines):
        line = lines[i]
        if host_needle in line and re.search(r"Host|host|rule", line):
            end = min(i + 35, len(lines))
            block = "".join(lines[i:end])
            orig = block
            for ws in wrong_services:
                block = re.sub(rf"{re.escape(ws)}[^\"\\s]*", correct_service, block)
            for wip in wrong_ips:
                if wip:
                    block = re.sub(
                        rf"http://{re.escape(wip)}:{port}",
                        f"http://{correct_ip}:{port}",
                        block,
                    )
            if block != orig:
                newlines = block.splitlines(keepends=True)
                if len(newlines) < (end - i):
                    newlines.extend(lines[i + len(newlines) : end])
                lines[i:end] = newlines[: end - i]
                changed += 1
            i = end
        else:
            i += 1
    text = "".join(lines)
    return changed

if builder:
    builder_svc = "typebot_typebot-walkup-builder-0"
    wrong_svcs = (
        "typebot_paginadevendas-1",
        "typebot_paginadevendas-0",
        "typebot_painel-typebot-crm-0",
    )
    wrong_ips = [x for x in (lp, painel) if x]
    for needle in ("walkup-builder", "typebot-typebot-walkup-builder"):
        n = fix_host_windows(needle, wrong_ips, builder, wrong_svcs, builder_svc)
        if n:
            print(f"  janela Host {needle} -> {builder_svc} ({n}x)")
    for wrong in wrong_svcs:
        pat = (
            rf"((?:Host\(`[^`]*walkup-builder[^`]*`[^)]*\)|walkup-builder\.achpyp)"
            rf"[\s\S]{{0,800}}?(?:service|\"service\")\s*:\s*\")"
            rf"{re.escape(wrong)}(\"')"
        )
        text, n = re.subn(pat, rf"\1{builder_svc}\2", text, flags=re.I)
        if n:
            print(f"  router builder service {wrong} -> {builder_svc} ({n}x)")
    if lp:
        text, n = re.subn(
            rf"(walkup-builder[\s\S]{{0,1200}}?\"url\"\s*:\s*\")http://{re.escape(lp)}:3000/?(\")",
            rf"\1http://{builder}:3000/\2",
            text,
            flags=re.I,
        )
        if n:
            print(f"  bloco builder url LP -> builder ({n}x)")

if viewer:
    viewer_svc = "typebot_typebot-walkup-viewer-0"
    wrong_svcs_v = (
        "typebot_paginadevendas-1",
        "typebot_paginadevendas-0",
        "typebot_painel-typebot-crm-0",
        "typebot_typebot-walkup-builder-0",
    )
    wrong_ips_v = [x for x in (lp, painel, builder) if x]
    for needle in ("walkup-viewer", "typebot-typebot-walkup-viewer"):
        n = fix_host_windows(needle, wrong_ips_v, viewer, wrong_svcs_v, viewer_svc)
        if n:
            print(f"  janela Host {needle} -> {viewer_svc} ({n}x)")

open(path, "w", encoding="utf-8").write(text)
PY

  cp "$CFG" "$after"
  if ! cmp -s "$before" "$after"; then
    cp -a "$CFG" "${CFG}.bak-permanent-$(date +%Y%m%d-%H%M%S)"
    echo "main.yaml atualizado"
    local traefik
    traefik=$(traefik_container)
    if [[ -n "$traefik" ]]; then
      docker kill -s HUP "$traefik" 2>/dev/null || docker restart "$traefik" >/dev/null
      sleep 2
      ensure_traefik_on_overlay
    fi
  fi
  rm -f "$before" "$after"
  echo "IPs: LP=${lp_ip} PAINEL=${painel_ip} BUILDER=${builder_ip:-off} VIEWER=${viewer_ip:-off} MINIO=${minio_ip:-off}"
}

http_code() {
  local host="$1" path="${2:-/}"
  curl -sS -o /dev/null -w "%{http_code}" --resolve "${host}:443:127.0.0.1" --max-time 12 \
    "https://${host}${path}" 2>/dev/null || echo "000"
}

lp_wrong_backend() {
  local body
  body=$(curl -sS --resolve chattypebot.com:443:127.0.0.1 --max-time 12 "https://chattypebot.com/" 2>/dev/null || true)
  grep -qiE 'Entrar|Sign In|email@company.com' <<< "$body" && return 0
  return 1
}

builder_wrong_backend() {
  local body
  body=$(curl -sS --resolve typebot-typebot-walkup-builder.achpyp.easypanel.host:443:127.0.0.1 \
    --max-time 12 "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin" 2>/dev/null || true)
  grep -qiE 'Drax — Atendimento|Voltar ao início|Página não encontrada' <<< "$body" && return 0
  return 1
}

run_fix() {
  echo "=== traefik-permanent $(date -Is) ==="
  ensure_traefik_on_overlay
  patch_main_yaml

  local lp painel app
  lp=$(http_code chattypebot.com)
  painel=$(http_code painel.chattypebot.com)
  app=$(http_code app.chattypebot.com /health)

  if lp_wrong_backend; then
    echo "ALERTA: LP responde tela Typebot — forçando patch LP"
    patch_main_yaml
    lp=$(http_code chattypebot.com)
  fi

  if builder_wrong_backend; then
    echo "ALERTA: Builder responde LP Drax — patch + restart Traefik"
    patch_main_yaml
    local traefik
    traefik=$(traefik_container)
    if [[ -n "$traefik" ]]; then
      docker restart "$traefik" >/dev/null
      sleep 15
      ensure_traefik_on_overlay
      patch_main_yaml
      if builder_wrong_backend; then
        echo "ALERTA: ainda LP após restart — rotas builder no main.yaml:"
        grep -n "walkup-builder" "$CFG" 2>/dev/null | head -25 || true
        echo ">>> Easypanel → typebot-walkup-builder → Domínios → destino http://\$(docker inspect ... builder IP):3000/"
      fi
    fi
  fi

  if [[ "$lp" == "502" || "$lp" == "000" || "$painel" == "502" || "$painel" == "000" ]]; then
    local traefik
    traefik=$(traefik_container)
    if [[ -n "$traefik" ]]; then
      echo "LP=${lp} painel=${painel} — restart Traefik (último recurso)"
      docker restart "$traefik" >/dev/null
      sleep 12
      ensure_traefik_on_overlay
      patch_main_yaml
      lp=$(http_code chattypebot.com)
      painel=$(http_code painel.chattypebot.com)
    fi
  fi

  local builder_code
  builder_code=$(http_code typebot-typebot-walkup-builder.achpyp.easypanel.host /signin)
  echo "RESULTADO lp:${lp} painel:${painel} app:${app} builder_signin:${builder_code}"
  [[ "$lp" == "200" || "$lp" == "307" ]] && [[ "$painel" == "200" || "$painel" == "307" ]]
}

should_patch_for_name() {
  local name="$1"
  case "$name" in
    *painel*|*paginadevendas*|*typebot_api*|*api-typebot*|*typebot_api-*|*easypanel*)
      return 0
      ;;
  esac
  return 1
}

run_fix_locked() {
  local runner
  runner=$(script_path)
  mkdir -p "$(dirname "$LOCK_FILE")"
  if command -v flock >/dev/null 2>&1; then
    flock -n "$LOCK_FILE" -c "\"${runner}\" run >> \"${LOG}\" 2>&1" || true
  else
    "${runner}" run >> "${LOG}" 2>&1 || true
  fi
}

schedule_patch() {
  local delay="${1:-2}"
  (
    sleep "$delay"
    run_fix_locked
  ) &
}

watch_deploy_events() {
  local runner
  runner=$(script_path)
  echo "=== traefik-permanent watch (automático) runner=${runner} ==="
  echo "Eventos: container start|die|destroy + service update. Timer 20s em paralelo."

  docker events --format '{{.Type}} {{.Action}} {{.Actor.Attributes.name}}' | while read -r typ action name; do
    [[ -z "$name" ]] && continue
    local key="${typ}:${action}"
    case "$key" in
      container:start|container:die|container:kill|container:destroy)
        should_patch_for_name "$name" || continue
        schedule_patch 2
        ;;
      service:update)
        should_patch_for_name "$name" || continue
        schedule_patch 4
        ;;
    esac
    if [[ "$typ" == "container" && "$action" == health_status:* ]]; then
      should_patch_for_name "$name" && schedule_patch 2
    fi
  done
}

install_watch_service() {
  cat > "$WATCH_UNIT_PATH" <<EOF
[Unit]
Description=Traefik Easypanel — patch automático em redeploy (docker events)
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=${INSTALL_PATH} watch
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$WATCH_SERVICE"
  echo "Systemd: ${WATCH_SERVICE} ativo"
}

install_timer_service() {
  cat > "$TIMER_SERVICE_UNIT" <<EOF
[Unit]
Description=Traefik Easypanel — patch periódico (backup automático)

[Service]
Type=oneshot
ExecStart=${INSTALL_PATH} run
EOF

  cat > "$TIMER_UNIT_PATH" <<EOF
[Unit]
Description=Traefik Easypanel — timer 20s (sem intervenção manual)

[Timer]
OnBootSec=20
OnUnitActiveSec=20
AccuracySec=1

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$TIMER_SERVICE"
  echo "Systemd: ${TIMER_SERVICE} ativo (patch a cada 20s)"
}

install_permanent() {
  local src dest
  src=$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")
  dest="$INSTALL_PATH"
  if [[ "$src" != "$dest" ]]; then
    cp "$src" "$dest"
    chmod +x "$dest"
  fi

  echo "Instalando fix permanente em ${dest}"

  cat > "$CRON_FILE" <<EOF
# Traefik Easypanel — backup se o watcher falhar (Swarm IP drift)
* * * * * root ${dest} run >> ${LOG} 2>&1
EOF
  chmod 644 "$CRON_FILE"

  if command -v systemctl >/dev/null 2>&1; then
    install_watch_service || echo "AVISO: systemd watch falhou"
    install_timer_service || echo "AVISO: systemd timer falhou"
  else
    echo "AVISO: sem systemd — instale systemd ou use cron apenas (até 60s de 502)"
  fi

  run_fix || true

  echo ""
  echo "=== Instalação concluída (automático; não rode comandos após cada deploy) ==="
  echo "  Script:   ${dest}"
  echo "  Watcher:  ${WATCH_UNIT_PATH}"
  echo "  Timer:    ${TIMER_UNIT_PATH} (20s)"
  echo "  Cron:     ${CRON_FILE} (backup)"
  echo "  Log:      ${LOG}"
  echo ""
  echo "Status:"
  systemctl is-active "${WATCH_SERVICE}" 2>/dev/null && echo "  watch: OK" || echo "  watch: verificar"
  systemctl is-active "${TIMER_SERVICE}" 2>/dev/null && echo "  timer: OK" || echo "  timer: verificar"
  echo ""
  echo "Diagnóstico opcional: ${dest} run"
}

show_status() {
  echo "=== traefik-permanent status ==="
  for unit in "$WATCH_SERVICE" "$TIMER_SERVICE"; do
    if systemctl list-unit-files "$unit" &>/dev/null; then
      echo -n "  ${unit}: "
      systemctl is-active "$unit" 2>/dev/null || echo "inactive"
      systemctl is-enabled "$unit" 2>/dev/null | sed 's/^/    enabled: /'
    else
      echo "  ${unit}: (não instalado — rode: $(script_path) install)"
    fi
  done
  if [[ -f "$CRON_FILE" ]]; then
    echo "  cron: ${CRON_FILE} (presente)"
  else
    echo "  cron: ausente"
  fi
  if [[ -x "$INSTALL_PATH" ]]; then
    echo "  script: ${INSTALL_PATH}"
  else
    echo "  script: ${INSTALL_PATH} (ausente)"
  fi
}

case "${1:-run}" in
  install) install_permanent ;;
  run) run_fix ;;
  watch) watch_deploy_events ;;
  status) show_status ;;
  *)
    echo "Uso: $0 install | run | watch | status"
    exit 1
    ;;
esac
