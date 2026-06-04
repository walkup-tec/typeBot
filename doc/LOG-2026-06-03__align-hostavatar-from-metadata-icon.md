# LOG — hostAvatar alinhado ao ícone de Metadados

**Data:** 2026-06-03  
**Solicitação:** Ícone sobe em Configurações → Metadados, mas avatar nas bolhas do fluxo não carrega.

## Causa

No Typebot, **Metadados** (`icon`, `settings.metadata.favIconUrl`) e **Theme → Chat → hostAvatar** são campos separados. Upload no menu esquerdo não atualiza automaticamente `theme.chat.hostAvatar.url`.

## Alteração

- `extractWorkingBrandIconUrl` + `alignHostAvatarFromBrandIcon` em `typebot-media-sanitize.service.ts`
- `sanitizeTypebotSchemaMedia` sempre chama `alignHostAvatarFromBrandIcon` ao final
- `repair-media` força alinhamento após patch de branding MinIO

## Arquivos

- `apps/api/src/typebot/typebot-media-sanitize.service.ts`
- `apps/api/src/typebot/typebot-media-repair.service.ts`

## Validação local

- `npm run build:api` — OK

## Pendências

1. Redeploy serviço **api** (commit ainda local até push/deploy do usuário)
2. `POST /api/master/tenants/:id/typebot/repair-media` no tenant afetado
3. Ou republicar fluxo após deploy; sync/import também passa por `sanitizeTypebotSchemaMedia`

## Workaround manual (sem API)

No builder: **Theme → Chat → Avatar do bot** — usar a mesma URL do campo **Ícone** em Metadados.
