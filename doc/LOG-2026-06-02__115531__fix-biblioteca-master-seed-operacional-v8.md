# LOG: Fix Biblioteca Master + Seed Operacional (v8)

## Chats e solicitações abertas

- Solicitação ativa: resolver tudo sem envolver o usuário até o momento do deploy/redeploy.
- Problema: Biblioteca Master sem fluxos em produção (`flowsSavedCount=0`).

## Alterações técnicas realizadas

- `apps/api/src/flows/source-master-sync.service.ts`
  - Reforçado fallback multi-proprietário (`appendPersistedFlowsFallback`) com dedupe por URL.
  - Enriquecimento de retorno com `ownerEmail` e `ownerName`.
- `apps/api/src/flows/flow.routes.ts`
  - `handleSourceFlowsRequest` com fallback resiliente mesmo em erro de Typebot.
- `apps/api/src/bootstrap/seed-operational-data-on-empty.ts` (novo)
  - Restauração automática de dados operacionais quando produção subir com tenants>0 e flows=0.
  - Fonte: `apps/api/data-seed` (`saved-flows.json`, `system-master-library.json`, `tenant-id-map.json`).
  - Realinha `tenantId` por e-mail do proprietário.
- `apps/api/src/server.ts`
  - Boot passa a executar seed operacional antes de iniciar rotina normal.
- `apps/api/src/flows/flow.repository.ts`
  - Novo método `reloadFromStorage()`.
- `apps/api/data-seed/*` (novos)
  - `saved-flows.json`, `system-master-library.json`, `tenant-id-map.json`.
- `apps/admin/src/App.tsx` + `apps/admin/src/styles.css`
  - Biblioteca Master exibindo todos os fluxos com coluna Proprietário.
- `apps/api/src/deploy-marker.ts`
  - `DEPLOY-2026-06-01-api-biblioteca-v8`.
- Testes utilitários:
  - `apps/api/scripts/test-biblioteca-master-source-flows.ts`
  - `scripts/test-biblioteca-master-source-flows.mjs`

## Comandos executados

- `npx tsc --noEmit` em `apps/api` (OK).
- `node scripts/test-biblioteca-master-source-flows.mjs` (OK).
- `npx tsc --noEmit` em `apps/admin` (falhas pré-existentes em `liveInboxUtils.ts` e tipagem de `QueueListItem`, fora do escopo).

## Resultado das validações

- Teste de seed + listagem passou:
  - `restored: true`
  - `flowsSavedCount: 16`
  - `sourceFlowsCount: 16`
  - owners: `walkup@walkuptec.com.br`, `draxsistemas@gmail.com`, `mozart.hotmart@gmail.com`, `somaconecta@gmail.com`

## Pendências para retomada

1. Commit + push dos arquivos alterados para `master`.
2. Usuário executar deploy/redeploy no Easypanel (API e painel).
3. Validar produção:
   - `/health` com `deployMarker=biblioteca-v8`
   - `flowsSavedCount > 0`
   - Biblioteca Master exibindo fluxos por proprietário.
