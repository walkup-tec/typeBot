# Snapshot — Soma triplicada + timeout Etapa 6

**Data:** 2026-06-05

## Sintoma

- Banner: "Sem ligação à API" (timeout 28s no painel).
- Soma Etapa 6: 1 biblioteca + 3× CLT workspace + Drax.

## Causas

1. **Timeout cliente:** `refreshTenantFlowList` abortava em 28s; sync no servidor pode levar mais (import + handoff + Typebot API).
2. **Dedupe API:** `isLinkedToSystemMasterDefault` ignorava dedupe por **título** igual ao fluxo padrão da matriz — cópias workspace "Empréstimo do Trabalhador CLT" nunca eram fundidas.

## Fix (local)

- `typebot-flow-viewer-url-sync.ts`: `isExplicitSystemDefaultLibraryCopy` — dedupe só protege cópia com `librarySourceId`.
- `App.tsx`: timeout 120s; em timeout tenta `loadFlows` da API.
- Marker: `DEPLOY-2026-06-05-soma-dedupe-title-fix-v3` / `v40`.

## Pendência

Push + redeploy **api** (stop + implantar se /health não mudar) + redeploy **painel-typebot-crm** → Soma Etapa 6 Atualizar lista.
