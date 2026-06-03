# Snapshot — logs pos-deploy API (builder 502)

**Data:** 2026-06-03

## Logs do usuario

- `ECONNRESET` / `fetch failed` em `listTargetWorkspacesWithProbe`
- `[typebot-flow-viewer-url-sync] list workspaces failed lastStatus=502`
- `[typebot-auto-sync] synced=0 failed=1 skipped=1`

## Diagnostico

1. **Typebot builder publico 502** — API nao consegue listar workspaces/typebots.
2. **Nao e bug da Biblioteca Master** — rotina background `typebot-tenant-flow-sync` (a cada 7s).
3. **Deploy marker em producao:** `typebot-api.achpyp.easypanel.host/health` ainda mostra `DEPLOY-2026-06-02-api-typebot-health` (commit `530f1b4` **nao aplicado** no build).
4. **`app.chattypebot.com/health`** retornou 502 apos redeploy (Traefik/domino API).

## Fix codigo (este commit)

- `fetch` com try/catch em `listTargetWorkspacesWithProbe`, `listWorkspaceTypebotsRaw`, `fetchMatrixWorkspaceTypebots` — sem stack trace no log.
- Log boot: `[saas-api] running deployMarker=... masterLibrary=...`

## Proximo passo operacional

1. Redeploy servico **`api`** confirmando log de boot com `DEPLOY-2026-06-03-api-biblioteca-v3-safe`.
2. Corrigir builder 502 (Traefik / `scripts/fix-typebot-acesso-agora-vps.sh` ou Easypanel dominios).
3. Validar `https://app.chattypebot.com/health` = 200 + marker v3.
4. Redeploy **painel** + `.\scripts\smoke-biblioteca-master.ps1`
