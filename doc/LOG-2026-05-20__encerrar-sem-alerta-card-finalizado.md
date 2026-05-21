# LOG 2026-05-20 — Encerrar atendimento sem alerta

## Pedido
- Sem confirm/alert ao encerrar
- Card: status "Finalizado", cor neutra sem destaque

## Alterações
- Removidos confirm e alert no handoff-view
- API lista fila com `includeClosed` (listInbox)
- Card `--finished`, pill cinza "Finalizado"
- Mantém lead na aba Minhas após encerrar

## Deploy
api-typebot-crm + painel-typebot-crm
