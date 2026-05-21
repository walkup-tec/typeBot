# LOG 2026-05-20 — Menu lead (etiquetas, propriedade, atendente, fixar)

## Pedido
- Um ícone de menu ao lado do nome (remover ícones separados de propriedade/etiqueta)
- Manter só ícone de agendamento
- Menu com hover: etiquetas (múltiplas), propriedade, atribuir atendente
- Fixar conversa + alfinete na lista
- Remover atribuição do drawer de detalhes

## Alterações
- API: `labelIds[]`, `labels[]`, `isPinned` em QueueContact + PATCH profile
- handoff-view: menu consolidado + submenus
- LiveInboxScreen: pin na lista, ordenação fixados primeiro, postMessage queue-updated
- LeadDetailModal: remove seção Atribuição

## Deploy
api-typebot-crm + painel-typebot-crm
