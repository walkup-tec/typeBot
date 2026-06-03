# LOG 2026-06-03 — health DNS + botão Atualizar travado

## Sintomas
- `https://api.chattypebot.com/health` → "Este acesso não funcionou" (DNS NXDOMAIN ou sem registro A).
- Painel: botão Biblioteca Master fica em "Atualizando…" indefinidamente.
- Build Easypanel `db1effd` **Success**, mas `/health` em `app.chattypebot.com` ainda retorna marker **v4** (container antigo).

## Causas
1. **DNS:** API pública está em `app.chattypebot.com`, não em `api.chattypebot.com` (ver `doc/DNS-api-chattypebot-com.md`).
2. **UI:** `loadMasterLibrarySourceFlows` não chamava `setIsRefreshingMasterLibrary(false)` no `finally`.
3. **Swarm:** imagem nova buildada; task em execução ainda é revisão anterior (marker v4).

## Alterações repo
- `apps/admin/src/App.tsx`: `finally` libera loading; fallback `app.chattypebot.com` se build usa `api.chattypebot.com` no painel.
- `apps/admin/src/deploy-marker.ts`: `DEPLOY-2026-06-03-admin-fix-refresh-api-fallback`

## Validação remota (2026-06-03)
- `https://app.chattypebot.com/health` → **200**, marker `DEPLOY-2026-06-03-api-biblioteca-v4-pos-traefik` (ainda não v5).
- `api.chattypebot.com` → não resolve daqui.

## VPS — forçar API v5 (bash)
```bash
curl -sS https://app.chattypebot.com/health | head -c 400
docker service ps typebot_api --no-trunc | head -20
docker service update --force typebot_api
sleep 15
curl -sS https://app.chattypebot.com/health | grep -o 'DEPLOY-[^"]*'
```
Esperado após force: `DEPLOY-2026-06-03-api-biblioteca-v5-sync-fix`

## Easypanel painel
- Redeploy painel após push (fix botão + fallback API).
- Build env recomendado: `VITE_API_BASE_URL=https://app.chattypebot.com`

## DNS (opcional definitivo)
- Registro **A** `api` → `72.60.51.127` (remover CNAME conflitante em `api`).
