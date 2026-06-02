# Snapshot — Biblioteca Master sem toast técnico e sem fluxos soma

**Data:** 2026-06-02  
**Chat:** remover mensagem `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`; Ctrl+R ainda mostra 5 fluxos antigos.

## Sintoma
- Toast: "Nenhum fluxo no workspace matriz. Confira token do builder e TYPEBOT_SOURCE_MASTER_WORKSPACE_ID na API (Easypanel)."
- Tabela com 5 fluxos (URLs `soma-typebot`) após F5.

## Causa
- **Painel/API em produção desatualizados** (bundle antigo com fallback multi-tenant / sem filtro Walkup).
- Ctrl+R só recarrega o JS já servido pelo Easypanel; não aplica código do repo.

## Alterações (repo, não deployadas até push + rebuild)
- `apps/admin/src/App.tsx`: filtro cliente `walkupMasterLibraryFlows` (exclui `soma-typebot`); sem toast técnico ao listar vazio; empty state curto.
- `apps/api/src/flows/source-master-sync.service.ts`: só workspace matriz + Live; prune fluxos obsoletos no tenant walkup; dedupe; exclui `soma-typebot` na URL.
- `apps/api/src/flows/flow.routes.ts`: remove import morto `appendPersistedFlowsFallback`.

## Validação local
- Linter OK em `App.tsx` e `source-master-sync.service.ts`.

## Próximo passo (obrigatório)
1. Commit + push no GitHub (branch do Easypanel).
2. Redeploy **`api-typebot-crm`** e **`painel-typebot-crm`** (build admin: `npm ci && npm run build:admin`).
3. No painel: **Atualizar lista** (POST sync-source + GET source-flows).
4. Conferir env API: `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`, `TYPEBOT_SOURCE_VIEWER_BASE_URL`, `TYPEBOT_SOURCE_BUILDER_API_TOKEN`.

## Resultado esperado pós-deploy
- 0 ou 1 fluxo Live (Walkup viewer `typebot-typebot-walkup-viewer`).
- Sem toast com variáveis de ambiente.
