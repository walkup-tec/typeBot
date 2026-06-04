# Snapshot — handoff Soma NoSuchKey MinIO

**Data:** 2026-06-04

## Sintoma

Após botão "atendimento ao vivo" no fluxo Typebot (tenant somaconecta), mobile abre página MinIO com `NoSuchKey` e path `public/typebot/typebot/public/...`.

## Causa

1. URL de avatar do viewer com segmento **duplicado** (`typebot/typebot/public/`) — objeto não existe no bucket.
2. Essa URL era colocada em `profileImageUrl` na query do handoff ou usada no bloco **Redirect** do Typebot em vez de `url_direct` / `handoffUrl`.

## Correção (código)

- `collapseDuplicatedMinioPublicPath` + rewrite em `normalizeTypebotMediaUrl`.
- `resolveHandoffProfileImageUrl` — logo do tenant via `/api/public/tenants/:id/logo` ou MinIO `branding/{tenantId}/logo`.
- Handoff **não** inclui mais `profileImageUrl` na query (evita link enorme/quebrado).
- Resposta handoff: aliases `redirectTarget`, `visitUrl`, `openUrl` = mesma URL do chat.
- Marker: `DEPLOY-2026-06-04-handoff-minio-profile-fix`.

## Typebot (operacional)

No bloco Redirect após o webhook: usar **`{{url_direct}}`** ou **`{{handoffUrl}}`** do body — **não** URL de imagem/ícone do fluxo.

## Deploy

Serviço **api** Easypanel + validar `/health` marker novo.
