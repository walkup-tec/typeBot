# LOG — Deploy sem 502 prolongado (painel)

## Pedido

Bad Gateway >10s em todo redeploy de `painel.chattypebot.com`.

## Causa

Traefik `main.yaml` com IP/DNS Swarm morto; gap até cron de 1 min; porta host no Swarm (task Pending).

## Alterações repo

- `apps/admin/scripts/serve-production.mjs` + start via `node` (health `/health`, SIGTERM)
- `scripts/traefik-permanent-vps.sh` — IP do container mais recente, HUP 2s, systemd `watch` em docker events
- `scripts/post-easypanel-redeploy-vps.sh`
- `doc/DEPLOY-SEM-502-PAINEL.md`

## VPS (obrigatório uma vez)

```bash
/root/traefik-permanent-vps.sh install
docker service update --update-order start-first typebot_painel-typebot-crm
```

Easypanel painel: **remover** porta host; health check `/health`.

## Pós cada redeploy

`/root/traefik-permanent-vps.sh run` ou aguardar watcher (~3s).
