# LOG 2026-06-04 — Fluxos assinantes + promote rápido

## Commit
`DEPLOY-2026-06-04-walkup-fluxos-assinantes-promote-rapido`

## Problemas
1. Promote demorava (API bloqueava sync de todos assinantes) → fluxo sumia do topo e só depois aparecia em compartilhados.
2. GET flows com sync pesado em todo `quick=1` → lista Drax lenta/vazia.
3. Filtro não mantinha padrão só por URL/título.

## Fix API
- Promote responde rápido; sync Typebot dos assinantes em **background**.
- `quick=1` → `ensureSubscriberFlowsQuick`; `sync=1` ou `!quick` → sync completo.
- Prune não apaga padrão; filtro por URL/título do item padrão.

## Fix painel
- Otimista + banner + scroll para «Fluxos compartilhados» + indicador Processando.
- `loadSystemMasterLibrary` não apaga otimista; não recarrega durante promote.
- Etapa 6 «Atualizar lista» usa `sync=1` após sync-workspace.

## Redeploy
**api** e **painel** (obrigatório os dois).

## Teste
1. Promote CLT → aparece na hora em compartilhados com Processando.
2. Drax etapa 6 → Atualizar lista → fluxo padrão + workspace.
