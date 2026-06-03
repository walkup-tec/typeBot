# LOG 2026-06-03 — Commit redeploy Biblioteca v4 pós-Traefik

## Contexto
- Incidente Traefik/Swarm (painel Pending porta host, LP overlay morta, easypanel:3000).
- LP/painel/app voltaram 200 no VPS; API em prod ainda podia estar marker antigo.

## Commit preparado
- Markers v4: `DEPLOY-2026-06-03-api-biblioteca-v4-pos-traefik` + admin + `walkup-live-only-v4-pos-traefik`
- `doc/REDEPLOY-BIBLIOTECA-TRAEFIK-2026-06-03.md`
- Smoke + DEPLOY-BIBLIOTECA-MASTER atualizados

## Código Biblioteca (já em master desde v3)
- `source-master-sync.service.ts` prune seguro, sem fallback multi-tenant
- `masterLibraryFlows.ts`, `resolveStatusToastTone.ts`, `App.tsx`

## Deploy usuário
1. Easypanel api + painel redeploy
2. `.\scripts\smoke-biblioteca-master.ps1`
