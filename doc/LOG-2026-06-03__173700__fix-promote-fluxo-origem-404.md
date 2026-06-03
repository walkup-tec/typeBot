# LOG 2026-06-03 — promote 404 "Fluxo de origem não encontrado"

## Sintoma (usuário master)
- `POST /api/master/system-library/promote` → **404**
- Body: `sourceFlowId`, `typebotRemoteId`, `typebotPublicId`, `url` (CLT emprestimo-clt)
- Resposta: `{"message":"Fluxo de origem não encontrado."}` (mensagem **curta**)

## Causa raiz
1. **Produção com API antiga:** antes de `715e543`, promote só fazia `flowRepository.getById(sourceFlowId)` — ignorava hints.
2. **ID da lista ≠ disco:** após `sync-source`, o fluxo pode existir com outro UUID; painel ainda envia id antigo.

## Correção (código)
- `resolveMasterSourceFlowForPromote`: busca por id/remoteId/publicId/url; sync Typebot; **`ensureMasterSourceFlowFromPromoteHints`** grava fluxo no tenant walkup se hints válidos.
- Marker: `DEPLOY-2026-06-03-api-promote-hints-upsert` / `walkup-live-only-v9-promote-hints-upsert`
- `npm run build:api` OK

## Deploy obrigatório
Easypanel serviço **api** → redeploy → `curl https://app.chattypebot.com/health` deve mostrar novo `deployMarker`.

## Validação pós-deploy
Biblioteca Master → Atualizar lista → Definir como padrão no fluxo CLT → 200 OK.
