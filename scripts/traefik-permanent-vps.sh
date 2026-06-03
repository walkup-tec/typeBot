#!/bin/bash
# Solução PERMANENTE Traefik + Easypanel + Swarm (LP/painel/API/Typebot/MinIO).
#
# Instalação única no VPS:
#   curl -sSL .../traefik-permanent-vps.sh -o /root/traefik-permanent-vps.sh
#   chmod +x /root/traefik-permanent-vps.sh
#   /root/traefik-permanent-vps.sh install
#
# O cron roda a cada 1 min e corrige IPs sem derrubar o site (sem restart Traefik na rotina).
set -euo pipefail

INSTALL_PATH="/root/traefik-permanent-vps.sh"
CRON_FILE="/etc/cron.d/traefik-permanent-fix"
LOG="/var/log/traefik-permanent-fix.log"
CFG=/etc/easypanel/traefik/config/main.yaml
NET=easypanel-typebot

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" -f status=running | head -1)
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

  if [[ "$lp" == "502" || "$lp" == "000" ]]; then
    local traefik
    traefik=$(traefik_container)
    if [[ -n "$traefik" ]]; then
      echo "LP=${lp} — restart Traefik (último recurso)"
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
# Traefik Easypanel — corrige upstreams a cada 1 min (Swarm IP drift)
*/1 * * * * root ${dest} run >> ${LOG} 2>&1
EOF
  chmod 644 "$CRON_FILE"

  run_fix || true

  echo ""
  echo "Instalado:"
  echo "  Script: ${dest}"
  echo "  Cron:   ${CRON_FILE} (a cada 1 min)"
  echo "  Log:    ${LOG}"
  echo ""
  echo "Teste manual: ${dest} run"
}

case "${1:-run}" in
  install) install_permanent ;;
  run) run_fix ;;
  *)
    echo "Uso: $0 install | run"
    exit 1
    ;;
esac
