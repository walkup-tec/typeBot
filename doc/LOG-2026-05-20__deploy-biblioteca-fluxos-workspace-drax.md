# LOG deploy — biblioteca fluxos = workspace Typebot (Drax)

## Commits para produção
1. `ecf274e` — `deploy(api): prune-estrito-fluxos-workspace-typebot-alinha-drax`
2. `401c6b0` — `deploy(api+painel): filtra-typebots-por-workspace-remove-fluxos-antigos-drax`

## Serviços Easypanel
| Serviço | Obrigatório | Build |
|---------|-------------|-------|
| `api-typebot-crm` | Sim | Node — usar commit `401c6b0` ou posterior |
| `painel-typebot-crm` | Sim | Vite — `VITE_API_BASE_URL=https://typebot-api-typebot-crm.achpyp.easypanel.host` |

## Env API (validar)
- `TYPEBOT_BUILDER_API_TOKEN` / `TYPEBOT_TARGET_BUILDER_API_TOKEN`
- `TYPEBOT_TARGET_BUILDER_API_BASE_URL` (com `/api` se self-host)
- `TYPEBOT_TARGET_VIEWER_BASE_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host`

## Pós-deploy
1. Drax → Master Console → Etapa 6 → **Atualizar lista**
2. Esperado: **1 fluxo** — Drax Sistemas (workspace Typebot)
3. Sem tabela catálogo Biblioteca Master na etapa 6

## Rollback
Redeploy commit anterior a `ecf274e` (ex. `4b6f7e8`).
