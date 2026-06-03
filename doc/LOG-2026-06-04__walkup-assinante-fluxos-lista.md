# LOG 2026-06-04 — Assinante Drax: fluxos padrão + workspace na etapa 6

## Sintoma
Fluxo definido como padrão e fluxos do workspace Typebot não aparecem na lista do assinante (Drax).

## Causa raiz
1. `pruneTenantFlowsToMatchWorkspace` removia fluxos padrão sem `typebotRemoteId` (só URL da matriz).
2. GET `?quick=1` não importava typebots do workspace para `saved-flows`.
3. `sync-workspace` não reaplicava padrões após import.

## Fix
- Prune: não remove `isLinkedToSystemMasterDefault`.
- Filtro: se builder falhar, mantém fluxos com `librarySourceId` / `typebotRemoteId`.
- `syncSubscriberFlowsForListing` no GET assinante, promote e sync-workspace.

## Commit
`DEPLOY-2026-06-04-walkup-assinante-fluxos-lista`

## Redeploy
1. **api** (obrigatório)
2. **painel** (marker alinhado; opcional se só API mudou)

## Teste Drax
Etapa 6 → Atualizar lista → fluxo CLT padrão + fluxos do workspace.
