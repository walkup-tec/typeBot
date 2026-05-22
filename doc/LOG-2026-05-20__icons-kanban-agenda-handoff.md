# LOG 2026-05-20 — Ícones Kanban/Agenda no handoff (sem labels)

## Solicitação
- Remover pills ao lado dos ícones ("Segunda", "22/05, 06:27").
- Ícones verdes quando kanban/agenda definidos.
- Clique abre menu com valor atual + opção remover para redefinir.

## Arquivos alterados
- `apps/api/src/queue/queue.routes.ts`

## Mudanças
- Removidos `leadKanbanBadge` e `leadScheduleBadge`.
- `.is-set` nos botões calendário/kanban (verde, igual WhatsApp).
- Menus ancorados em `lead-meta-icon-wrap`.
- Agenda: bloco "Agendamento atual" + "Remover agendamento".
- Kanban: "Coluna atual" + "Remover coluna do Kanban" + lista de colunas.

## Validação
- `npm run build:api` — OK

## Pendências
- Commit + push + rebuild **api-typebot-crm** (handoff servido pela API).
- Ctrl+F5 no iframe da Fila ao vivo após deploy.
