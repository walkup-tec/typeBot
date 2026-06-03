# LOG 2026-06-03 — Fluxo padrão visível para assinantes

## Contexto
- Usuário: fluxo CLT definido como padrão no master; não aparece na lista dos assinantes.
- Tenant **Drax Sistemas**: etapa 6 sem fluxos (padrão nem workspace).

## Alterações
- `apps/api/src/flows/subscriber-default-flows.service.ts` (novo)
- `apps/api/src/flows/flow.routes.ts` — promote, GET flows, import fix
- `apps/api/src/tenants/tenant.routes.ts` — sync-workspace, sync-defaults
- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts` — filtro workspace
- `apps/api/src/deploy-marker.ts`

## Validação local
- `npm run build:api` — OK

## Pendente ops
1. Commit + push `master`
2. Redeploy Easypanel serviço **api**
3. `https://app.chattypebot.com/health` → marker `DEPLOY-2026-06-03-api-subscriber-default-flows`
4. Painel → assinante Drax → Etapa 6 → **Atualizar lista**

## Retomada
- Se ainda vazio: POST sync-workspace no tenant ou re-promover padrão no master.
