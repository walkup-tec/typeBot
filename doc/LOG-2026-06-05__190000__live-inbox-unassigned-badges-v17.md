# LOG 2026-06-05 19:00 — Fila Não Atribuídos + badges v17

## Solicitação
- Novo atendimento → fila "Não Atribuídos"
- Badge numérico vermelho em "Não Atribuídos" e "Hoje"

## Alterações
- `liveInboxUtils.ts`: unassigned = todos `waiting`; minhas = só `in_service`/`closed` do agente
- `LiveInboxScreen.tsx`: badge vermelho em Hoje e Não Atribuídos (count > 0)
- `styles.css`: `.live-inbox-tab-count--alert`
- `queue.service.ts`: remove `reserveAgent` no enqueue (lead sem atendente até assumir)
- Markers: API v17, admin v17

## Pendência
- Commit + push + deploy painel (admin) e API (enqueue)
