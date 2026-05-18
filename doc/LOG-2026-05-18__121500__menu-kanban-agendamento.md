# LOG 2026-05-18 — Menu Kanban e Agendamento

## Solicitação
Remover **Configurar CRM** do menu; adicionar **Kanban** e **Agendamento**. Ordem: Kanban, Fila ao Vivo, Agendamento, Lista de clientes.

## Arquivos
- `apps/admin/src/App.tsx`
- `doc/memoria.md`

## Mudanças
- `ScreenId`: `kanban`, `scheduling`; removido `configureCrm`.
- `allowedScreens`: attendant e assinante com os 4 itens na ordem acima; system_master com kanban + scheduling (sem fila).
- Menu reordenado; ícones SVG novos; placeholders e `SCREEN_PAGE_HEADER`.

## Pendências
- Implementar telas Kanban e Agendamento (funcional).
