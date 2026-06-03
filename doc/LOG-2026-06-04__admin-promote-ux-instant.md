# LOG 2026-06-04 — UX promote Biblioteca Master (instantâneo + processando)

## Problema
Ao clicar «Definir como Padrão», o fluxo sumia da lista superior e só depois aparecia em «Fluxos compartilhados» (API promote lenta + reload que sobrescrevia estado).

## Fix (painel)
- Entrada otimista imediata em `systemMasterLibrary`
- Indicador «Processando…» na linha compartilhada e no botão
- `loadSystemMasterLibrary({ mergeOptimistic: true })` após 1,2s (evita race com GET antigo)

## Marker
`DEPLOY-2026-06-04-admin-promote-ux-instant`

## Redeploy
Somente serviço **painel**.
