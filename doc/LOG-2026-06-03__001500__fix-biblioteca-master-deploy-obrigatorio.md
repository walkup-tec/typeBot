# Snapshot — Biblioteca Master: causa raiz + fix definitivo

**Data:** 2026-06-03

## Diagnóstico produção (curl)
- `GET app.chattypebot.com/health` → `deployMarker: DEPLOY-2026-06-02-api-typebot-health` (**código antigo**)
- `GET .../source-flows` → **5 fluxos** de vários tenants (soma-typebot + drax + walkup)
- Bundle painel `index-BhODyx1E.js` → **sem** `isWalkupMatrixViewerUrl` / `walkupMasterLibraryFlows`

**Conclusão:** commits `b7ae08f` e `968dd6e` **nunca foram deployados** no Easypanel. Ctrl+R não aplica código.

## Fix código (este commit)
- **API:** remove `appendPersistedFlowsFallback`; só tenant walkup@ + Live matriz; prune disco obsoleto.
- **Painel:** `masterLibraryFlows.ts` — exige `typebotRemoteId` + owner walkup + URL walkup viewer.
- Markers: `DEPLOY-2026-06-03-api-biblioteca-walkup-only` / `DEPLOY-2026-06-03-admin-biblioteca-walkup-only`.

## Deploy obrigatório (Easypanel)
1. Serviço **`api`** — Reimplantar (build API).
2. Serviço **painel** — Reimplantar (`npm ci && npm run build:admin`).
3. Validar:
   - `curl https://app.chattypebot.com/health` → marker `...biblioteca-walkup-only`
   - `source-flows` → 0 ou 1 item (só `emprestimo-clt` se Live)
   - Painel → Biblioteca Master vazia ou 1 fluxo; bundle contém `admin-biblioteca-walkup-only`
