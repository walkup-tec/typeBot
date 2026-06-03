# LOG 2026-06-03 — Limpeza API antiga no repositório

## Escopo
Remover/atualizar referências ao serviço Easypanel **`api-typebot-crm`** e ao host **`api.chattypebot.com`** (NXDOMAIN / código antigo).

## Padrão atual
| Item | Valor |
|------|--------|
| Serviço Easypanel | `api` |
| URL pública API | `https://app.chattypebot.com` |
| Health | `GET /health` |

## Alterações código
- `flow.routes.ts`: removido alias `GET /api/master/source-flows`
- `apps/admin/src/lib/publicApiBase.ts` + `App.tsx`
- `apps/sales/src/lib/salesApi.ts` + `check-prod-vite-api.mjs` (falha build se api.chattypebot.com)
- `server.ts`, `widget/public/_headers`: removido api.chattypebot.com de frame-ancestors padrão
- Scripts PS1/cjs: default `app.chattypebot.com`

## Docs operacionais atualizados
DNS-api, EASYPANEL-PAGINA-VENDAS, PAINEL-VITE-build, DEPLOY-VPS, REDEPLOY-PIX, FIX-502, VOLUME, deploy-mensagens, env examples.

## Mantido de propósito
- `queue.routes.ts`: rewrite env legado api → app
- `source-master-sync`: filtro/prune `soma-typebot` URLs
- `flow-url-health`: migração soma-typebot-walkup-viewer → typebot-typebot-walkup-viewer
- Logs históricos `doc/LOG-*` (não reescritos)

## Validação
- `npm run build:api` OK
