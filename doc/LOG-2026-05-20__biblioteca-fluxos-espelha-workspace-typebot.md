# LOG 2026-05-20 — biblioteca fluxos = workspace Typebot

## Solicitação
Conta Drax: biblioteca de fluxos deve mostrar somente o que existe hoje no Typebot da Drax.

## Alterações
- `pruneTenantFlowsToMatchWorkspace`: remove duplicatas e fluxos sem bot no workspace.
- Chamado ao final de `importManualWorkspaceTypebotsIntoTenantFlows` (também se workspace vazio).
- `GET /api/master/tenants/:id/flows`: não usa mais `ensureTenantFlowLibraryFromQueue` se `typebotWorkspaceId` definido.

## Validação
- `npm run build` em `apps/api` — OK.

## Deploy
Rebuild API; abrir Fluxos do assinante Drax no painel (dispara sync+prune).
