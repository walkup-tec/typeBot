# LOG 2026-06-04 — build fix + handoff patch no sync tenant

## Falha Easypanel

- Commit `4e987ce` — build TS: `updatedAt` não existe em `SavedFlow`.

## Correção

- `typebot-flow-viewer-url-sync.ts`: score usa só `createdAt`.
- `reapplyHandoffPatchesForTenantWorkspace` + chamada em `syncWorkspaceTypebotFlowsForTenant` (Atualizar lista).
- Marker: `DEPLOY-2026-06-04-handoff-patch-on-tenant-sync`.

## Validação local

- `npm run build:api` — OK.

## Pós-deploy

- Soma Promotora → Etapa 6 → **Atualizar lista** → testar viewer `empr-stimo-do-trabalhador-clt-bxn7orp`.
