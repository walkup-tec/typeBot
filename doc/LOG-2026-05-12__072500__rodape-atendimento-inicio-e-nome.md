# Snapshot - rodape do atendimento com inicio e nome

## Solicitacao

- No rodape do chat do atendente, mostrar apenas data/hora do atendimento iniciado e nome do usuario logado.

## Alteracoes

- `apps/api/src/lib/agent-session-meta.ts`: formatacao do rodape e resolucao do inicio do atendimento.
- `apps/api/src/queue/queue.routes.ts`: handoff-view sem UUID da sessao.
- `apps/widget/src/agentSessionMeta.ts` e `WidgetApp.tsx`: mesmo rodape no widget.

## Validacao

- `npm run build:api` OK.

## Pendencias

- Redeploy API e widget.
