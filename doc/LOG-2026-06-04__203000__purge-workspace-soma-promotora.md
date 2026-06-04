# LOG 2026-06-04 — Purge workspace Soma Promotora

## Pedido
Excluir todos os fluxos do workspace Typebot **Soma Promotora** e apagar registros locais antes de reajustar matriz e copiar de novo.

## Produção (antes do deploy)
- Tenant: `1f992ff8-741b-451d-b3c8-bb08ec1ba92a` — Soma Promotora — `somaconecta@gmail.com`
- Workspace Typebot: `cmpzox1zz0002pj1edk97zsrf`
- `/health` marker antigo: `DEPLOY-2026-06-04-attendant-resend-route`
- `GET .../flows` → **5** registros (4× CLT duplicado + 1× Drax Sistemas)
- `POST .../purge-workspace-flows` → **404** (rota ainda não no ar)

## Código
- `typebot-purge-tenant-workspace.service.ts` — DELETE todos typebots do workspace + `flowRepository.deleteByTenantId` + fila opcional
- Status `workspace_cleared` — pausa auto-sync / watcher / defaults até sync manual
- Rota: `POST /api/master/tenants/:id/typebot/purge-workspace-flows`
- Script: `scripts/purge-soma-workspace-flows.cjs`
- Marker: `DEPLOY-2026-06-04-purge-tenant-workspace-flows`

## Após deploy
```powershell
node scripts/purge-soma-workspace-flows.cjs
```
Validar: `GET /api/master/tenants/1f992ff8-.../flows` → `[]`; workspace vazio no builder Soma.

## Recopiar fluxos
1. Ajustar fluxo na matriz (Walkup)
2. Master Console Soma → Etapa 6 → **Atualizar lista** (remove flag `workspace_cleared` e reimporta)
