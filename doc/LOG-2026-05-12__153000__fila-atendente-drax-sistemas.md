# Snapshot — fila Atendente Drax Sistemas

**Data:** 2026-05-12

## Solicitações abertas

- Redeploy **painel-typebot-crm** e **api-typebot-crm** com alterações do nome Drax.
- Validar coluna Atendente na Fila de atendimento após hard refresh.

## Alterações

- API: `resolveQueueContactAssignedAgentName` em `GET /api/chat/queue` e detalhe do contato.
- API: atribuição grava `assignedAgentName` já normalizado.
- Painel: coluna Atendente usa `resolveQueueItemAssignedAgentName` na renderização.

## Arquivos

- `apps/api/src/lib/agent-session-meta.ts`
- `apps/api/src/queue/queue.routes.ts`
- `apps/api/src/queue/queue.service.ts`
- `apps/admin/src/App.tsx`
- `doc/memoria.md`

## Comandos

- `npm run build:api`
- `npm run build:admin`

## Validação

- Build admin: OK.
- Build API: OK após correção de import em `queue.routes.ts`.

## Pendências

- Commit/push e redeploy painel + API.
- Smoke na Fila de atendimento do tenant Drax.
