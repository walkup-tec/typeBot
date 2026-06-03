# Drax — lista fluxos etapa 6 (HTTP 200 com body vazio)

## Solicitação

Assinante **Drax Sistemas** sem fluxos na etapa 6; Network 200 com respostas ~0 kB em `flows?quick=1`.

## Causa raiz

1. `filterTenantFlowsForWorkspace` descartava fluxos quando catálogo builder não batia com `remoteId`/`publicId`.
2. `pruneTenantFlowsToMatchWorkspace` removia fluxos com `librarySourceId` sem `typebotRemoteId` no workspace.
3. Painel com Typebot **provisionado** ocultava seção «Fluxos ativos na biblioteca» e dependia só da API; se `[]`, tela vazia.

## Alterações

- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts` — filtro com fallback ao disco; prune ignora `librarySourceId`; `shouldAlwaysShow` inclui `publicId`.
- `apps/api/src/flows/subscriber-default-flows.service.ts` — `syncSubscriberFlowsForListing` + `listSubscriberTenantFlowsForMaster`.
- `apps/api/src/flows/flow.routes.ts` — GET flows usa listagem centralizada.
- `apps/admin/src/App.tsx` — biblioteca visível para assinantes; workspace lista `selectedTenantFlows`.
- Markers: `DEPLOY-2026-06-04-walkup-drax-fluxos-lista-nao-vazia`.

## Validação

- `npm run build:api` — OK.

## Pendências

1. Redeploy **api** + **painel** no Easypanel.
2. Confirmar `/health` → marker `walkup-drax-fluxos-lista-nao-vazia`.
3. Master → Drax → Etapa 6 → **Atualizar lista** → CLT padrão + Campanha Facebook.
