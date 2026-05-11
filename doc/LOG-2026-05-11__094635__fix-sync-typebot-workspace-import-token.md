# Snapshot — alinhar biblioteca SaaS ao workspace Typebot (Drax)

## Chats e solicitacoes abertas

- Usuario comparou prints da Etapa 3 (Biblioteca de fluxos) e do builder Typebot no mesmo workspace `draxsistemas@gmail.com` / Drax Sistemas.
- Objetivo: sincronizacao automatica no backend, sem depender de modal/campos no admin.

## Arquivos alterados

- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts`
- `apps/api/src/server.ts`
- `doc/memoria.md`
- `doc/LOG-2026-05-11__094635__fix-sync-typebot-workspace-import-token.md`

## Comandos executados

- `GET /health` (producao): `flowsSavedCount=1`, `tenantsCount=1`.
- `GET /api/typebot/flow-status` para `teste-5-olx3rjp` (active) e `teste-0rzqap7` (inactive/404).
- `npm run build:api` (local): OK.

## Resultado de validacoes

- Producao ainda com 1 fluxo salvo e tenant sem workspace vinculado na listagem anterior.
- Correcao aplicada no codigo: token Builder com fallback unificado; vinculo automatico de workspace; health com `typebotTenantFlowImportConfigured`.

## Pendencias para retomada

1. Commit/push e redeploy da API no Easypanel.
2. Confirmar env `TYPEBOT_TARGET_BUILDER_API_TOKEN` ou `TYPEBOT_BUILDER_API_TOKEN` e `TYPEBOT_TARGET_VIEWER_BASE_URL`.
3. Revalidar `GET /health` (`typebotTenantFlowImportConfigured: true`) e lista de fluxos do `tenant_drax` apos alguns segundos do watcher.
