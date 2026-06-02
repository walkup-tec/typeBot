#!/bin/bash
# EMERGÊNCIA: restaura LP + painel + API quando main.yaml apontou tudo para Typebot builder.
# NUNCA usar sed em 10.0.4.*:3000 global — só serviços por nome.
set -euo pipefail

CFG=/etc/easypanel/traefik/config/main.yaml
NET=easypanel-typebot
TRAEFIK=$(docker ps -q -f name=easypanel-traefik -f status=running | head -1)

container_ip() {
  docker ps -q -f "name=${1}" -f status=running | head -1 | xargs -r docker inspect \
    --format "{{index .NetworkSettings.Networks \"${NET}\" \"IPAddress\"}}"
}

LP_IP=$(container_ip paginadevendas)
PAINEL_IP=$(container_ip painel-typebot-crm)
BUILDER_IP=$(container_ip typebot-walkup-builder || true)
VIEWER_IP=$(container_ip typebot-walkup-viewer || true)
MINIO_IP=$(container_ip minio || true)

[[ -z "$LP_IP" || -z "$PAINEL_IP" ]] && { echo "ERRO: LP ou painel sem IP"; exit 1; }

echo "LP=$LP_IP PAINEL=$PAINEL_IP BUILDER=${BUILDER_IP:-off} VIEWER=${VIEWER_IP:-off} MINIO=${MINIO_IP:-off}"
cp -a "$CFG" "${CFG}.bak-restore-lp-$(date +%Y%m%d-%H%M%S)"

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
    print(f"  service {name} -> http://{ip}:{port}/ ({n})")
    return n

for svc, ip in [
    ("typebot_paginadevendas-1", lp),
    ("typebot_paginadevendas-0", lp),
    ("typebot_painel-typebot-crm-0", painel),
    ("typebot_typebot-walkup-builder-0", builder),
    ("typebot_typebot-walkup-viewer-0", viewer),
]:
    fix_service(svc, ip)

replacements = [
    ("typebot_paginadevendas", lp, "3000"),
    ("typebot_painel-typebot-crm", painel, "3000"),
    ("typebot_typebot-walkup-builder", builder, "3000"),
    ("typebot_typebot-walkup-viewer", viewer, "3000"),
    ("typebot_minio", minio, "9000"),
]
for host, ip, port in replacements:
    if not ip:
        continue
    for prefix in ("", "tasks."):
        old = f"http://{prefix}{host}:{port}"
        new = f"http://{ip}:{port}"
        text = text.replace(old + "/", new + "/")
        text = text.replace(old, new)

text = re.sub(r'http://typebot_api[^"]*', "http://172.17.0.1:3333", text)
text = re.sub(r"http://172\.17\.0\.1:3000/?", f"http://{lp}:3000/", text)

open(path, "w", encoding="utf-8").write(text)
print("main.yaml restaurado")
PY

if [[ -n "$TRAEFIK" ]]; then
  for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do
    docker network connect "$net" "$TRAEFIK" 2>/dev/null || true
  done
fi

curl -sS -o /dev/null -w "lp:%{http_code} " --resolve chattypebot.com:443:127.0.0.1 --max-time 12 https://chattypebot.com/ || echo -n "lp:000 "
curl -sS -o /dev/null -w "painel:%{http_code} " --resolve painel.chattypebot.com:443:127.0.0.1 --max-time 12 https://painel.chattypebot.com/ || echo -n "painel:000 "
curl -sS -o /dev/null -w "app:%{http_code}\n" --resolve app.chattypebot.com:443:127.0.0.1 --max-time 12 https://app.chattypebot.com/health || echo "app:000"
echo "=== Fim restore LP/painel ==="
