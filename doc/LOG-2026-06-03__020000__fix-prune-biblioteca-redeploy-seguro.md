# Snapshot — logs redeploy API + fix prune perigoso

**Data:** 2026-06-03

## Logs que o usuario viu (NAO sao erro da Biblioteca Master)

```
[typebot-tenant-flow-sync] tenant=... imported=0 reason=no_new_active_typebots candidates=3
[typebot-auto-sync] synced=1 failed=0 skipped=1
```

- Rotina **background** que roda a cada ~7s no boot da API.
- `no_new_active_typebots` = workspace tem 3 typebots, nada novo para importar. **Normal.**
- `[typebot-auto-sync]` = sync de defaults para assinantes. **Normal.**

## Bug grave encontrado (corrigido neste commit)

`listMasterLibrarySourceFlows` chamava **prune** com `activeRemoteIds` vazio quando:
- builder retornava 502 no redeploy, OU
- env `TYPEBOT_SOURCE_*` ausente

Isso **apagava fluxos do tenant walkup** no disco durante redeploy.

## Fix v3-safe

- Prune de obsoletos **somente** se builder respondeu OK ao listar workspace matriz.
- Prune de URLs `soma-typebot` no tenant walkup continua seguro.
- Logs `no_new_active_typebots` deixam de poluir como WARN.
- Markers: `DEPLOY-2026-06-03-api-biblioteca-v3-safe` / `walkup-live-only-v3-safe-prune`.

## Deploy

1. Servico **api** (commit deste snapshot)
2. Servico **painel**
3. `.\scripts\smoke-biblioteca-master.ps1`

## Pendencia

Usuario parou redeploy aguardando commit fechado.
