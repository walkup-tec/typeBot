# LOG 2026-06-04 — Matriz emprestimo-clt handoff

## Objetivo
Fluxo matriz https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/emprestimo-clt abrir tela de atendimento (handoff-view).

## Diagnóstico
- Viewer 200 OK.
- Handoff API OK mas tenant resolvido errado (Drax) quando só `emprestimo-clt` no body.
- Painel matriz: publicId `empr-stimo-do-trabalhador-clt-mvf1z0w` vs slug canônico `emprestimo-clt`.

## Alterações
- `typebot-matrix-handoff-repair.service.ts` + POST `repair-matrix-handoff`
- `queue.routes.ts`: viewer Walkup → tenant master `07d245ea-...`
- `doc/FLUXO-MATRIZ-EMPRESTIMO-CLT-HANDOFF.md`, `scripts/repair-matrix-emprestimo-clt.cjs`
- Marker `DEPLOY-2026-06-04-matrix-clt-handoff-emprestimo`

## Pendências
- Redeploy API; rodar repair; validar fluxo end-to-end no Typebot builder.
