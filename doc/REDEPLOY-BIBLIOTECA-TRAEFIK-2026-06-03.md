# Redeploy — Biblioteca Master após incidente Traefik/Swarm (2026-06-03)

Use este guia **depois** de LP/painel/API responderem 200 no Traefik.

## Markers esperados (commit v4)

| Serviço | Campo | Valor |
|---------|--------|--------|
| **api** | `deployMarker` | `DEPLOY-2026-06-03-api-biblioteca-v4-pos-traefik` |
| **api** | `masterLibraryLogicVersion` | `walkup-live-only-v4-pos-traefik` |
| **painel** | bundle `ADMIN_BUILD_MARKER` | `DEPLOY-2026-06-03-admin-biblioteca-v4-pos-traefik` |

## Easypanel — ordem

1. **api** — `npm ci && npm run build:api` — Implantar  
   - Se `/health` continuar marker antigo: **scale 0** → aguardar 30s → **scale 1** (porta 3333 presa no Swarm).
2. **painel** — `npm ci && npm run build:admin` — Implantar  
   - **Portas:** sem mapeamento host (`3001`/`3002`). Só domínio `painel.chattypebot.com`.
3. **paginadevendas** — só se LP 502: `docker service update --force typebot_paginadevendas` no VPS + `bash /root/fix-traefik-easypanel-502.sh`.

## Env obrigatório (api)

- `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`
- `TYPEBOT_SOURCE_VIEWER_BASE_URL`
- `TYPEBOT_SOURCE_BUILDER_API_TOKEN`

## Validar

```powershell
.\scripts\smoke-biblioteca-master.ps1
```

Manual:

- `GET https://app.chattypebot.com/health` — markers v4 acima; `typebotBuilderReachable: true` (builder fora = lista vazia, não é deploy antigo).
- `GET https://app.chattypebot.com/api/master/system-library/source-flows` — 0 ou 1 fluxo Walkup Live; **sem** URLs `soma-typebot`.
- Painel → Biblioteca Master → Atualizar lista → toast **verde**.

## VPS — Traefik (não substitui redeploy)

Após redeploy de serviços, se 502 voltar:

```bash
bash /root/fix-traefik-easypanel-502.sh
```

Evite loop com `traefik-permanent-vps.sh` quando `lp/painel/app` já estão 200.

## Causa raiz Swarm (referência)

- Painel: `host-mode port already in use` → remover portas host + `scale 0` / `1`.
- LP: overlay IP morto → `docker service update --force typebot_paginadevendas`.
- Traefik: rotas `http://easypanel:3000` → script fix aponta para IP overlay correto.
