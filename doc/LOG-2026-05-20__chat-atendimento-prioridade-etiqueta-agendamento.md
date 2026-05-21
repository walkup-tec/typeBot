# LOG 2026-05-20 — Prioridade, etiqueta e agendamento no chat do atendente

## Pedido
Ao lado do nome do lead no chat: prioridade, etiqueta e data de agendamento, com ícones alinhados ao layout.

## Implementação
- `QueueContact`: `priorityId/Name`, `labelId/Name/Color`, `scheduledAt`
- `PATCH /api/chat/queue/:id/profile` aceita os novos campos
- handoff-view (agente): ícones + badges + menus; persiste na fila
- Listas vêm de `tenant-priorities.json` e `tenant-labels.json`

## Deploy
- api-typebot-crm (painel já usa embed=inbox)
