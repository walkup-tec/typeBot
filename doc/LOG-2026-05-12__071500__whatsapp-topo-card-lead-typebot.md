# Snapshot - WhatsApp no topo do painel do lead

## Solicitacao

- No card do contato, exibir no topo o telefone informado no Typebot em vez de "Indisponivel".

## Alteracoes

- `apps/widget/src/resolveLeadWhatsapp.ts`: fallback de WhatsApp a partir de `leadContext`.
- `apps/widget/src/LeadDrawerPanel.tsx`: preview e copia usam o valor resolvido.
- `apps/widget/src/WidgetApp.tsx`: preenche o rascunho com o WhatsApp do contexto ao carregar o contato.
- `apps/api/src/queue/queue.routes.ts`: mesma logica na handoff-view do atendente.

## Validacao

- `npm run build:api` e `npm run build:widget` (executar apos alteracoes).

## Pendencias

- Redeploy API e widget.
- Conferir lead com `WhatsApp` em `leadContext` no painel do atendente.
