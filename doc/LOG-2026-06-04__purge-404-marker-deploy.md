# LOG 2026-06-04 — Purge 404: imagem antiga

## Diagnóstico
- `POST /api/master/system/purge-extra-users` → 404 em produção
- `GET /health` → `deployMarker: DEPLOY-2026-06-03-typebot-legacy-minio-hostavatar` (sem rota purge)
- Código local + `dist` contêm a rota; commit `b44b97a` no master remoto

## Ação
- Marker novo: `DEPLOY-2026-06-04-purge-extra-users`, `purgeExtraUsersRoute: true` no `/health`
- Commit local: `2a34b8b` — `[e3cf306] deploy[api]: purge-extra-users marker health v24`

## Pendente usuário
1. `git push origin master`
2. Redeploy serviço **api** no Easypanel (título com SHA acima)
3. Validar `/health` → marker novo + `purgeExtraUsersRoute: true`
4. `Invoke-RestMethod` purge
