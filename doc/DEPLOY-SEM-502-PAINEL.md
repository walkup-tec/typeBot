# Deploy sem Bad Gateway — 100% automático

O 502 no redeploy é o **Traefik** com IP antigo do container. **Não** é preciso rodar comando manual após cada deploy no Easypanel.

## Uma vez no VPS (única ação manual)

```bash
curl -fsSL "https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/traefik-permanent-vps.sh" -o /root/traefik-permanent-vps.sh
chmod +x /root/traefik-permanent-vps.sh
/root/traefik-permanent-vps.sh install
```

O `install` ativa **três camadas automáticas**:

| Camada | O que faz |
|--------|-----------|
| **traefik-permanent-watch** | Escuta Docker (start/die/destroy/service update) e corrige em ~2–4 s |
| **traefik-permanent-fix.timer** | Roda patch a cada **20 s** (backup) |
| **cron** | Backup a cada minuto |

Depois disso: **redeploy no Easypanel = sem SSH, sem `run` manual**.

Verificar (opcional, uma vez):

```bash
systemctl status traefik-permanent-watch.service
systemctl status traefik-permanent-fix.timer
tail -20 /var/log/traefik-permanent-fix.log
```

## Easypanel — painel (configuração fixa)

| Item | Valor |
|------|--------|
| Build | `npm ci && npm run build:admin` |
| Start | `npm run start:admin` |
| Porta app | **3000** |
| Porta no host | **Nenhuma** (não usar `3002:3000`) |
| Domínio | `painel.chattypebot.com` → 3000 |
| Health check | `GET /health` (se o Easypanel tiver o campo) |

## Swarm (recomendado, uma vez)

```bash
docker service update --update-order start-first --update-parallelism 1 --update-delay 5s typebot_painel-typebot-crm
```

## Código no Git

Painel usa `apps/admin/scripts/serve-production.mjs` (`/health`, subida rápida).

## Se ainda aparecer 502

1. `install` não foi executado ou watch/timer parados → `systemctl enable --now traefik-permanent-watch traefik-permanent-fix.timer`
2. Build Easypanel falhou → logs de build
3. Porta host no painel → remover no Easypanel

**Não** é fluxo normal exigir `/root/traefik-permanent-vps.sh run` após cada deploy — isso só serve para diagnóstico.
