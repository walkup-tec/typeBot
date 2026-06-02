#!/bin/bash
# Hotfix favicon Drax no painel em produção (quando deploy Easypanel não atualiza o bundle).
set -euo pipefail

FAV_URL="https://raw.githubusercontent.com/walkup-tec/typeBot/master/apps/admin/public/favcon.png"
TMP="/tmp/drax-favcon.png"

echo "=== Diagnóstico painel ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.ID}}' | grep -iE 'painel|NAME' || true

PANEL=$(docker ps -q -f name=painel-typebot-crm -f status=running | head -1)
if [[ -z "$PANEL" ]]; then
  echo "ERRO: container painel-typebot-crm (running) não encontrado"
  exit 1
fi
echo "Container ativo: $PANEL ($(docker inspect --format '{{.Name}}' "$PANEL"))"

curl -fsSL "$FAV_URL" -o "$TMP"
cp "$TMP" /tmp/drax-favicon.ico

DIST=""
for base in /app/dist /app/apps/admin/dist /dist /usr/src/app/dist /opt/app/dist; do
  if docker exec "$PANEL" test -f "${base}/index.html" 2>/dev/null; then
    DIST="$base"
    break
  fi
done
if [[ -z "$DIST" ]]; then
  idx=$(docker exec "$PANEL" sh -c 'find / -path "*/dist/index.html" 2>/dev/null | head -1' || true)
  [[ -n "$idx" ]] && DIST=$(dirname "$idx")
fi
if [[ -z "$DIST" ]]; then
  echo "ERRO: dist/index.html não encontrado no container"
  exit 1
fi
echo "Pasta dist: $DIST"

docker cp "$TMP" "$PANEL:${DIST}/favcon.png"
docker cp /tmp/drax-favicon.ico "$PANEL:${DIST}/favicon.ico"

docker exec "$PANEL" python3 - "$DIST/index.html" <<'PY'
import sys, re
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
if "favcon.png" in text and "Drax" in text:
    print("index.html já atualizado")
    sys.exit(0)
links = """    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" href="/favcon.png" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/favcon.png" />
"""
if re.search(r"<title>", text):
    text = re.sub(r"<title>[^<]*</title>", links + "    <title>Drax — Painel de atendimento</title>", text, count=1)
else:
    text = text.replace("</head>", links + "  </head>", 1)
open(path, "w", encoding="utf-8").write(text)
print("index.html patchado")
PY

echo ""
echo "=== index.html no container ==="
docker exec "$PANEL" head -15 "${DIST}/index.html"

if [[ -x /root/traefik-permanent-vps.sh ]]; then
  echo ""
  echo "=== Traefik (IP painel atual) ==="
  /root/traefik-permanent-vps.sh run 2>&1 | tail -5
fi

echo ""
echo "Teste externo (deve ser image/png, não text/html):"
curl -sI --resolve painel.chattypebot.com:443:127.0.0.1 "https://painel.chattypebot.com/favicon.ico" | head -5
