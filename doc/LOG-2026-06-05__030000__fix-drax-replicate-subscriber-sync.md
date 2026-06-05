# Fix — Drax Sistemas replicado em assinantes no Atualizar lista

## Causa

`recoverTenantWorkspaceTypebotsFromVestiges` rodava em **todo** `sync-workspace` e:
- injetava `DRAX_KNOWN_REMOTE_IDS` em **todos** os tenants;
- importava `DRAX_KNOWN_PUBLIC_IDS` de outros workspaces para o workspace do assinante.

## Fix

- Recovery automático só no tenant matriz (`walkup@walkuptec.com.br`).
- Assinantes: `pruneMasterExclusiveTypebotsFromTenantWorkspace` remove Drax do Typebot + saved-flows após sync.
- Endpoint manual `recover-workspace-flows` mantido para matriz.

## Marker

`DEPLOY-2026-06-05-no-drax-replicate-subscribers-v4`
