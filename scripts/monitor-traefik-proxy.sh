#!/bin/bash
# Monitoria diária: proxy Traefik ↔ API / LP / Painel
# Detecta anomalias, aplica fix e envia e-mail com relatório.
#
# Instalação VPS:
#   cp monitor-traefik.env.example /root/monitor-traefik.env  (preencher SMTP)
#   cp monitor-traefik-proxy.sh /root/
#   chmod +x /root/monitor-traefik-proxy.sh
#   crontab: 0 8 * * * /root/monitor-traefik-proxy.sh >> /var/log/monitor-traefik.log 2>&1

set -uo pipefail

ENV_FILE="${MONITOR_ENV_FILE:-/root/monitor-traefik.env}"
FIX_SCRIPT="${FIX_SCRIPT:-/root/fix-traefik-easypanel-502.sh}"
# Instalar auto-fix: scripts/install-traefik-autofix-cron-vps.sh (cron */3)
LOG_FILE="${LOG_FILE:-/var/log/monitor-traefik.log}"
CFG=/etc/easypanel/traefik/config/main.yaml
NET=easypanel-typebot
HOSTNAME_SHORT=$(hostname -s 2>/dev/null || echo "vps")

[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

MAIL_TO="${MAIL_TO:-wakup@walkuptec.com.br}"
TIME_WARN_SEC="${TIME_WARN_SEC:-8}"
TIME_FAIL_SEC="${TIME_FAIL_SEC:-25}"

REPORT=""
ANOMALIES=0
INTERNAL_ANOMALIES=0
FIX_APPLIED="nao"
NOW=$(date '+%Y-%m-%d %H:%M:%S %Z')

log_line() {
  REPORT+="$1"$'\n'
  echo "$1"
}

container_ip() {
  local filter="$1"
  local cid
  cid=$(docker ps -q -f "name=${filter}" | head -1)
  [[ -z "$cid" ]] && return 1
  docker inspect "$cid" --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

# name|url|expected_snippet (opcional, vazio = só HTTP 200)
check_public() {
  local name="$1" url="$2" expect="${3:-}"
  local host tmp body code time_s

  host=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
  tmp=$(mktemp)
  code=$(curl -sS -o "$tmp" -w "%{http_code}" --max-time "$TIME_FAIL_SEC" \
    --resolve "${host}:443:127.0.0.1" "$url" 2>/dev/null || echo "000")
  time_s=$(curl -sS -o /dev/null -w "%{time_total}" --max-time "$TIME_FAIL_SEC" \
    --resolve "${host}:443:127.0.0.1" "$url" 2>/dev/null || echo "999")
  body=$(head -c 8000 "$tmp" 2>/dev/null || true)
  rm -f "$tmp"

  local status="OK"
  if [[ "$code" != "200" ]]; then
    status="FALHA"
    ANOMALIES=$((ANOMALIES + 1))
    log_line "  [FALHA] $name — HTTP $code (${time_s}s) — $url"
  elif awk -v t="$time_s" -v w="$TIME_WARN_SEC" 'BEGIN{exit !(t+0>w+0)}'; then
    status="LENTO"
    ANOMALIES=$((ANOMALIES + 1))
    log_line "  [LENTO] $name — HTTP $code (${time_s}s > ${TIME_WARN_SEC}s) — $url"
  else
    log_line "  [OK] $name — HTTP $code (${time_s}s) — $url"
  fi

  if [[ -n "$expect" && "$code" == "200" ]]; then
    if ! grep -qi "$expect" <<< "$body"; then
      ANOMALIES=$((ANOMALIES + 1))
      log_line "  [FALHA] $name — conteúdo inesperado (esperado: $expect)"
    fi
  fi
}

bump_internal() {
  ANOMALIES=$((ANOMALIES + 1))
  INTERNAL_ANOMALIES=$((INTERNAL_ANOMALIES + 1))
}

check_swarm_service() {
  local svc="$1"
  local line replicas
  line=$(docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | grep -F "$svc" | head -1 || true)
  if [[ -z "$line" ]]; then
    bump_internal
    log_line "  [FALHA] serviço $svc — não encontrado"
    return
  fi
  replicas=$(awk '{print $2}' <<< "$line")
  if [[ "$replicas" != "1/1" && "$replicas" != *"/1" ]]; then
    bump_internal
    log_line "  [FALHA] serviço $svc — réplicas $replicas"
  else
    log_line "  [OK] serviço $svc — réplicas $replicas"
  fi
}

check_main_yaml() {
  local lp_ip painel_ip bad=0
  lp_ip=$(container_ip paginadevendas 2>/dev/null || echo "")
  painel_ip=$(container_ip painel-typebot-crm 2>/dev/null || echo "")

  if grep -q 'http://typebot_paginadevendas:3000/' "$CFG" 2>/dev/null; then
    bump_internal
    bad=1
    log_line "  [FALHA] main.yaml — LP ainda usa hostname Swarm morto (typebot_paginadevendas)"
  fi
  if grep -q 'http://typebot_painel-typebot-crm:3000/' "$CFG" 2>/dev/null; then
    bump_internal
    bad=1
    log_line "  [FALHA] main.yaml — Painel ainda usa hostname Swarm morto"
  fi
  if grep -q 'http://172\.17\.0\.1:3000/' "$CFG" 2>/dev/null; then
    bump_internal
    bad=1
    log_line "  [FALHA] main.yaml — LP aponta 172.17.0.1:3000 (Easypanel)"
  fi
  if [[ -n "$lp_ip" ]] && ! grep -q "$lp_ip" "$CFG" 2>/dev/null; then
    bump_internal
    bad=1
    log_line "  [FALHA] main.yaml — IP LP atual ($lp_ip) ausente no upstream"
  fi
  if [[ -n "$painel_ip" ]] && ! grep -q "$painel_ip" "$CFG" 2>/dev/null; then
    bump_internal
    bad=1
    log_line "  [FALHA] main.yaml — IP Painel atual ($painel_ip) ausente no upstream"
  fi
  [[ "$bad" -eq 0 ]] && log_line "  [OK] main.yaml — upstreams coerentes com containers atuais"
}

check_traefik_network() {
  local traefik
  traefik=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  if [[ -z "$traefik" ]]; then
    bump_internal
    log_line "  [FALHA] container Traefik não encontrado"
    return
  fi
  if docker inspect "$traefik" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -q "$NET"; then
    log_line "  [OK] Traefik conectado à rede $NET"
  else
    bump_internal
    log_line "  [FALHA] Traefik fora da rede $NET"
  fi
}

check_internal_backends() {
  local traefik lp_ip painel_ip
  traefik=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)
  lp_ip=$(container_ip paginadevendas 2>/dev/null || echo "")
  painel_ip=$(container_ip painel-typebot-crm 2>/dev/null || echo "")

  if [[ -z "$traefik" ]]; then return; fi

  if [[ -n "$lp_ip" ]]; then
    if docker exec "$traefik" wget -qO- --timeout=5 "http://${lp_ip}:3000/" 2>/dev/null | head -c 200 | grep -qi 'drax\|<html'; then
      log_line "  [OK] Traefik → LP ($lp_ip:3000)"
    else
      bump_internal
      log_line "  [FALHA] Traefik → LP ($lp_ip:3000) inacessível"
    fi
  fi

  if [[ -n "$painel_ip" ]]; then
    if docker exec "$traefik" wget -qO- --timeout=5 "http://${painel_ip}:3000/" 2>/dev/null | head -c 200 | grep -qi 'typebot\|<html'; then
      log_line "  [OK] Traefik → Painel ($painel_ip:3000)"
    else
      bump_internal
      log_line "  [FALHA] Traefik → Painel ($painel_ip:3000) inacessível"
    fi
  fi

  if docker exec "$traefik" wget -qO- --timeout=5 "http://172.17.0.1:3333/health" 2>/dev/null | grep -qi 'ok'; then
    log_line "  [OK] Traefik → API (172.17.0.1:3333/health)"
  else
    bump_internal
    log_line "  [FALHA] Traefik → API (172.17.0.1:3333) inacessível"
  fi
}

log_line "=========================================="
log_line "Monitor Traefik — $HOSTNAME_SHORT — $NOW"
log_line "=========================================="
log_line ""
log_line "## Endpoints públicos"
check_public "API" "https://app.chattypebot.com/health" "ok"
check_public "Landing" "https://chattypebot.com/" "Drax"
check_public "Painel" "https://painel.chattypebot.com/" "Typebot"
log_line ""
log_line "## Serviços Docker Swarm"
check_swarm_service "typebot_paginadevendas"
check_swarm_service "typebot_painel-typebot-crm"
check_swarm_service "typebot_api"
log_line ""
log_line "## Proxy / rede"
check_traefik_network
check_main_yaml
check_internal_backends

if [[ "$INTERNAL_ANOMALIES" -gt 0 ]]; then
  log_line ""
  log_line "## Correção automática"
  if [[ -x "$FIX_SCRIPT" ]]; then
    log_line "Anomalias internas: $INTERNAL_ANOMALIES — executando $FIX_SCRIPT ..."
    FIX_OUT=$("$FIX_SCRIPT" 2>&1) || true
    log_line "$FIX_OUT"
    FIX_APPLIED="sim"
    log_line ""
    log_line "## Re-teste pós-correção"
    ANOMALIES_AFTER=0
    _prev=$ANOMALIES
    ANOMALIES=0
    check_public "API" "https://app.chattypebot.com/health" "ok"
    check_public "Landing" "https://chattypebot.com/" "Drax"
    check_public "Painel" "https://painel.chattypebot.com/" "Typebot"
    ANOMALIES_AFTER=$ANOMALIES
    ANOMALIES=$_prev
    if [[ "$ANOMALIES_AFTER" -eq 0 ]]; then
      log_line "  [OK] Todos os endpoints OK após correção"
      RESUMO="Corrigido automaticamente — endpoints OK após fix"
    else
      log_line "  [FALHA] Ainda há $ANOMALIES_AFTER endpoint(s) com problema após fix"
      RESUMO="Correção aplicada mas ainda há falhas — revisão manual necessária"
    fi
  else
    log_line "Script de fix não encontrado: $FIX_SCRIPT"
    RESUMO="Anomalias internas — fix manual necessário"
  fi
elif [[ "$ANOMALIES" -gt 0 ]]; then
  RESUMO="Endpoints com alerta no teste público — proxy interno OK (sem restart)"
else
  RESUMO="Tudo OK — nenhuma anomalia"
fi

log_line ""
log_line "=========================================="
log_line "Resumo: $RESUMO | Anomalias iniciais: $ANOMALIES | Fix: $FIX_APPLIED"
log_line "=========================================="

SUBJECT="[Drax Monitor] Traefik $HOSTNAME_SHORT — $NOW — $RESUMO"

if [[ -z "${SMTP_HOST:-}" || -z "${SMTP_USER:-}" || -z "${SMTP_PASS:-}" ]]; then
  log_line "AVISO: SMTP não configurado ($ENV_FILE) — e-mail não enviado"
  exit 0
fi

REPORT_FILE=$(mktemp)
printf '%s' "$REPORT" > "$REPORT_FILE"

export REPORT_FILE SUBJECT MAIL_TO SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS
export MAIL_FROM="${MAIL_FROM:-$SMTP_USER}" HOSTNAME_SHORT
python3 << 'PYEOF'
import os, smtplib, ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

with open(os.environ["REPORT_FILE"], encoding="utf-8") as f:
    report = f.read()

subject = os.environ["SUBJECT"]
mail_to = os.environ.get("MAIL_TO", "wakup@walkuptec.com.br")
mail_from = os.environ.get("MAIL_FROM") or os.environ["SMTP_USER"]
host = os.environ["SMTP_HOST"]
port = int(os.environ.get("SMTP_PORT", "465"))
secure = os.environ.get("SMTP_SECURE", "true").lower() == "true"
user = os.environ["SMTP_USER"]
password = os.environ["SMTP_PASS"]
host_short = os.environ.get("HOSTNAME_SHORT", "vps")

status_color = "#16a34a" if "Tudo OK" in report else "#dc2626"
html = f"""<html><body style="font-family:monospace;font-size:13px">
<h2 style="color:{status_color}">Monitor Traefik — {host_short}</h2>
<p><strong>{subject}</strong></p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;white-space:pre-wrap">{report}</pre>
</body></html>"""

msg = MIMEMultipart("alternative")
msg["Subject"] = subject
msg["From"] = mail_from
msg["To"] = mail_to
msg.attach(MIMEText(report, "plain", "utf-8"))
msg.attach(MIMEText(html, "html", "utf-8"))

if secure:
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=ctx) as s:
        s.login(user, password)
        s.sendmail(mail_from, [mail_to], msg.as_string())
else:
    with smtplib.SMTP(host, port) as s:
        s.starttls()
        s.login(user, password)
        s.sendmail(mail_from, [mail_to], msg.as_string())

print(f"E-mail enviado para {mail_to}")
PYEOF

rm -f "$REPORT_FILE"
