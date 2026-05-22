# LOG 2026-05-20 — prioridade renomeada não refletia nos leads

## Solicitação
Prioridade "Atendimento" renomeada para "Urgente"; em leads já configurados continuava "Atendimento".

## Alterações
- `apps/api/src/lib/lead-agent-notes.ts` — resolve `priorityName` e etiquetas pelo catálogo na leitura
- `apps/api/src/queue/queue.repository.ts` — `propagatePriorityRename`, `propagateLabelRename`
- `apps/api/src/priorities/priority.routes.ts` — propaga após update
- `apps/api/src/labels/label.routes.ts` — propaga após update

## Validação
- `npm run build:api` — OK

## Pendências
- Deploy: rebuild **api-typebot-crm**
- Opcional: re-salvar prioridade "Urgente" uma vez para persistir rename em `queue-state.json` (UI já corrige só com leitura após deploy)
