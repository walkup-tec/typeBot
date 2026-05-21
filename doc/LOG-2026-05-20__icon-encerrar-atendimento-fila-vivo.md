# LOG 2026-05-20 — Ícone encerrar atendimento

## Pedido
Ícone para encerrar atendimento no chat do atendente.

## Implementação
- `POST /api/chat/queue/:contactId/complete` — status `closed`, mensagem de sistema, some da fila ao vivo
- Ícone no header (canto direito, hover vermelho), confirmação antes de encerrar
- `postMessage` → Fila ao vivo limpa seleção e atualiza lista
- Histórico de mensagens preservado

## Deploy
- api-typebot-crm + painel-typebot-crm
