# Snapshot — lista global de clientes (master do sistema)

**Data:** 2026-05-12

## Solicitações abertas

- Redeploy API e painel com endpoint e tela de lista global.
- Validar login como master do sistema e abertura do lead por assinante.

## Alterações

- Endpoint `GET /api/master/queue/contacts` com contatos de todos os tenants.
- Menu e tela **Lista de Clientes** habilitados para `system_master`.
- Coluna **Assinante** na tabela e no export Excel quando houver dados multi-tenant.

## Arquivos

- `apps/api/src/queue/queue.repository.ts`
- `apps/api/src/queue/queue.service.ts`
- `apps/api/src/queue/queue.routes.ts`
- `apps/admin/src/App.tsx`
- `apps/admin/src/clientDirectory.ts`
- `apps/admin/src/ClientsListScreen.tsx`
- `apps/admin/src/exportClientDirectoryExcel.ts`
- `doc/memoria.md`

## Comandos

- `npm run build:api`
- `npm run build:admin`

## Validação

- Builds API e admin: OK.
- Linter nos arquivos alterados: sem erros.

## Pendências

- Commit/push e redeploy.
- Smoke: master vê clientes de múltiplos assinantes; detalhe do lead abre com tenant correto.
