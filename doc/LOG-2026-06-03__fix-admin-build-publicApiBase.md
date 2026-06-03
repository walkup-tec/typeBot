# LOG 2026-06-03 — Fix build painel: publicApiBase

## Erro Easypanel (commit 0969c71)
```
Could not resolve "./lib/publicApiBase" from "src/App.tsx"
```

## Causa
`App.tsx` importava `publicApiBase.ts` mas o arquivo ficou **untracked** (não entrou no commit).

## Fix
- Commit `apps/admin/src/lib/publicApiBase.ts`
- Marker: `DEPLOY-2026-06-03-admin-public-api-base-module`

## Ops
Redeploy serviço **painel** apontando `master` mais recente.
