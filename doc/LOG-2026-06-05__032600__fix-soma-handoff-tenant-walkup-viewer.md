# Fix — handoff Soma ia para tenant Walkup

## Sintoma

Viewer `…/empr-stimo-do-trabalhador-clt-bxn7orp` não abria tela de atendimento correta para Soma.

## Causa

`/api/typebot/handoff` tratava **qualquer** URL no host `typebot-typebot-walkup-viewer` como fluxo **matriz** e forçava `tenantId` Walkup (`07d245ea…`), **antes** de considerar `tenantId` do body ou fluxo Soma em `saved-flows`.

Teste reproduzido: POST com `tenantId` Soma → resposta com `tenantId` Walkup.

## Fix

- `shouldHandoffResolveToMasterTenant`: matriz só se `publicId === emprestimo-clt`.
- Ordem: tenant/fluxo do assinante → matriz canônica.

## Marker

`DEPLOY-2026-06-05-soma-handoff-tenant-fix-v5`

## Pós-deploy

1. API no ar com marker v5
2. Soma → Etapa 6 → Atualizar lista (patch Set variable + Redirect)
3. Testar viewer Soma
