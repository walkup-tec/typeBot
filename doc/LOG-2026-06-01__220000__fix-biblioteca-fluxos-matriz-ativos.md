# LOG 2026-06-01 22:00 — Biblioteca de fluxos: matriz vê fluxos ativos

## Solicitação
Usuário matriz (`walkup@walkuptec.com.br` / tenant Drax Sistemas) precisa ver fluxos **ativos** na Biblioteca de Fluxos (etapa 6 e Biblioteca Master).

## Causas
1. `source-flows` retornava `[]` sem `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID` / viewer, mesmo com fluxos em `saved-flows.json`.
2. Sync-source falhava → admin não carregava `source-flows`.
3. `filterTenantFlowsForWorkspace` removia fluxos da conta matriz na listagem.
4. UI só mostrava fluxos **não publicados** na Biblioteca Master; catálogo etapa 6 sem vínculo aparecia inativo.

## Correções
### API (`apps/api`)
- `source-master-sync.service.ts`: fallback dos fluxos gravados no tenant matriz; map com `viewerUrlActive`.
- `flow.routes.ts`: não filtrar workspace para `walkup@walkuptec.com.br`.

### Admin (`apps/admin`)
- `selectableFlowLibrary`: merge fluxos ativos de `sourceMasterFlows`.
- Etapa 6: conta matriz trata como workspace completo; seção **Fluxos ativos** prioriza `healthStatus === active`.
- Biblioteca Master: bloco **Fluxos ativos no workspace matriz**.
- `loadMasterLibrarySourceFlows`: continua após falha de sync-source.

## Deploy
- Serviço **`api`** (typeBot) + **`painel-typebot-crm`** ou painel com admin.
- Env matriz: `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`, `TYPEBOT_SOURCE_VIEWER_BASE_URL`, token builder.

## Validar
1. Login `walkup@walkuptec.com.br` → Biblioteca Master → **Atualizar lista** → ver fluxos ativos.
2. Assinante matriz → Etapa 6 → **Fluxos ativos na biblioteca** + workspace.
