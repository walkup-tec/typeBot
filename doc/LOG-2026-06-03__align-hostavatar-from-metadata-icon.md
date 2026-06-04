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

## Git

- Commit: `a3aace1` — push `master` OK

## Atualização (sync-workspace repara avatar)

- `POST .../flows/sync-workspace` e `.../typebot/sync-workspace-flows` chamam `repairTenantTypebotMediaOnTarget` após sync
- Painel Etapa 6 «Atualizar lista» mostra quantos fluxos tiveram avatar reparado
- Marker: `DEPLOY-2026-06-03-typebot-hostavatar-sync-repair` / v22

## Pendências

1. Redeploy **api** (+ painel se quiser toast de reparo) — validar `/health` com marker v22
2. No assinante: Etapa 6 → **Atualizar lista** (repara hostAvatar a partir do ícone de Metadados)
3. Easypanel API: `TYPEBOT_S3_PUBLIC_BASE_URL` alinhado ao MinIO (reescrita de URLs)

## Workaround manual (sem API)

No builder: **Theme → Chat → Avatar do bot** — usar a mesma URL do campo **Ícone** em Metadados.
