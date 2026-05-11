# Snapshot — GET sync-workspace-flows e Builder API vazia

## Chats e solicitacoes abertas

- Usuario abriu URL de sync no navegador (`Cannot GET`) e Etapa 3 ainda so com `Teste` inativo.

## Arquivos alterados

- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts`
- `apps/api/src/tenants/tenant.routes.ts`
- `doc/memoria.md`
- `doc/LOG-2026-05-11__101723__sync-workspace-flows-get-e-diagnostico-builder.md`

## Comandos executados

- `POST /api/master/tenants/tenant_drax/typebot/sync-workspace-flows` (producao): `workspaces_list_empty`.
- `npm run build:api`: OK.

## Resultado de validacoes

- Gargalo atual: listagem de workspaces na Builder API, nao o painel CRM.

## Pendencias para retomada

1. Commit/push e redeploy da API.
2. Corrigir env Builder/viewer no Easypanel.
3. Revalidar sync e biblioteca do `tenant_drax`.
