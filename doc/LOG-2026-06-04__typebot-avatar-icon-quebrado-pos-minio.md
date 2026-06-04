# LOG — Avatar/ícone Typebot quebrado com imagens do fluxo OK

**Data:** 2026-06-04

## Sintoma

- Upload de imagens no fluxo (MinIO) funcionando após fix Traefik/host port.
- Avatar do bot / ícone no builder não carrega.

## Causa

- Imagens do fluxo: URLs novas `https://typebot-minio.../public/...`
- Avatar/ícone: `typebot.icon`, `theme.chat.hostAvatar.url`, `workspace.icon` com URLs antigas
  (`localhost`, vazias após sanitize) ou só `data:image` removido sem substituir por URL pública.
- API sem `TYPEBOT_S3_PUBLIC_BASE_URL` não reescreve localhost nos blocos; avatar perdia `hostAvatar.url`.

## Fix código

- `applyTenantBrandMediaToTypebotSchema` em `typebot-media-sanitize.service.ts`
- `isBrokenTypebotMediaUrl` + reaplicação após sanitize quando há tenant
- Workspace icon: URL pública do logo em vez de string vazia
- Doc API: `TYPEBOT_AVATAR_PUBLIC_BASE_URL`, `TYPEBOT_S3_PUBLIC_BASE_URL`

## Ops

1. Easypanel serviço `api`: env acima
2. Redeploy `api`
3. Painel master: `POST /api/master/tenants/:id/typebot/repair-media` ou sync do assinante
4. Hard refresh no builder; Tema → Avatar do bot
