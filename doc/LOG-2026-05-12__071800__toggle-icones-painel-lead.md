# Snapshot - toggle dos icones do painel do lead

## Solicitacao

- Ao clicar de novo no icone da barra, a secao aberta deve fechar.

## Alteracoes

- `apps/widget/src/LeadDrawerPanel.tsx`: icones usam `toggleSection`.
- `apps/api/src/queue/queue.routes.ts`: botoes `data-open-section` alternam estado do acordeao.

## Validacao

- `npm run build:api` OK.

## Pendencias

- Redeploy API e widget.
