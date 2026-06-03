# LOG 2026-06-04 — Fluxo padrão definitivo + gate build painel

## Commit
`DEPLOY-2026-06-04-walkup-fluxo-padrao-definitivo`

## Correções API
- `repairSubscriberDefaultLibrarySourceIds` — corrige `librarySourceId` legado (sourceFlowId → id do item master)
- Boot + watcher + promote + `POST /api/master/system-library/repair-subscriber-defaults`
- `propagateSystemDefaultFlowToAllTenants` atualiza vínculo se fluxo já existia com id errado

## Evita deploy quebrado do painel
- `scripts/check-admin-source-imports.mjs` no `npm run build:admin`
- `npm run predeploy:verify` na raiz

## Markers
- API: `DEPLOY-2026-06-04-walkup-fluxo-padrao-definitivo`
- Painel: mesmo marker

## Redeploy
1. **api** → validar `/health` marker novo
2. **painel** → build passa gate publicApiBase
3. Drax etapa 6: Atualizar lista (ou aguardar boot repair ~12s)

## Opcional pós-api
`POST https://app.chattypebot.com/api/master/system-library/repair-subscriber-defaults` (master auth)
