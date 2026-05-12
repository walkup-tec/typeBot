# Snapshot - nome do atendente na atribuicao

## Solicitacao

- Na atribuicao do lead, exibir o nome do usuario logado, nao o e-mail de cadastro.

## Alteracoes

- `apps/widget/src/resolveAttendantDisplayName.ts`: rotulo humano do atendente.
- `apps/widget/src/WidgetApp.tsx` e `LeadDrawerPanel.tsx`: lista sem e-mail no select.
- `apps/api/src/queue/queue.routes.ts`: mesma regra na handoff-view.

## Validacao

- `npm run build:api` OK.

## Pendencias

- Redeploy API e widget.
