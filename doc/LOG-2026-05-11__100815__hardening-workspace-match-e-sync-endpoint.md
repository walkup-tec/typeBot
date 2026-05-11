# Snapshot — biblioteca sem espelhar Typebot apos health OK

## Chats e solicitacoes abertas

- Usuario enviou print da Etapa 3 ainda com apenas `Teste` inativo apos deploy da API.
- Objetivo: sincronizar biblioteca com workspace Typebot sem acao manual no admin.

## Arquivos alterados

- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts`
- `apps/api/src/server.ts`
- `apps/api/src/tenants/tenant.routes.ts`
- `doc/memoria.md`
- `doc/LOG-2026-05-11__100815__hardening-workspace-match-e-sync-endpoint.md`

## Comandos executados

- `GET /health` (producao): watcher e token configurados; `flowsSavedCount=1`.
- `GET /api/master/tenants/tenant_drax/flows`: ainda 1 fluxo.
- `POST /api/master/tenants/tenant_drax/typebot/sync-defaults`: skipped (sem padroes master).
- `npm run build:api`: OK.

## Resultado de validacoes

- Deploy anterior nao bastou para popular biblioteca; tenant segue sem workspace vinculado na listagem.
- Novo hardening: match compacto, fallback workspace unico, logs `skipReason`, endpoint `sync-workspace-flows`.

## Pendencias para retomada

1. Commit/push e redeploy da API.
2. `POST /api/master/tenants/tenant_drax/typebot/sync-workspace-flows` e validar `flowCount` / `skipReason`.
3. Conferir env `TYPEBOT_BUILDER_API_BASE_URL=https://.../api` e token com acesso ao workspace Drax Sistemas.
