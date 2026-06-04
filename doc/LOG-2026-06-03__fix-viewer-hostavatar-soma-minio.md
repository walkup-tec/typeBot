# LOG — viewer emprestimo-clt avatar soma-minio

**URL:** https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/emprestimo-clt

## Sintoma

Ícone OK em Metadados no builder; avatar na bolha do chat no viewer não carrega.

## Causa (evidência)

HTML do viewer:

- **Bot avatar (quebrado):** `https://soma-minio.achpyp.easypanel.host/typebot/public/.../hostAvatar` → HTTP **502**
- **Imagem do bloco (OK):** `https://typebot-minio.achpyp.easypanel.host/typebot/public/.../blocks/...`

Publicação antiga gravou `theme.chat.hostAvatar` no host MinIO legado **soma-minio**; uploads novos vão para **typebot-minio**.

## Fix código

- `isLegacyMinioPublicHost` + reescrita para `TYPEBOT_S3_PUBLIC_BASE_URL` em `normalizeTypebotMediaUrl`
- `soma-minio` tratado como URL quebrada → `alignHostAvatarFromBrandIcon` usa ícone/favicon de Metadados
- Marker: `DEPLOY-2026-06-03-typebot-legacy-minio-hostavatar`

## Ops

1. Redeploy API com commit do fix + `TYPEBOT_S3_PUBLIC_BASE_URL` no serviço api
2. Painel → assinante → Etapa 6 → **Atualizar lista** (repair + publish)
3. Recarregar viewer `/emprestimo-clt`

## Produção no momento do diagnóstico

`/health` ainda `DEPLOY-2026-06-04-typebot-imagens-etapa6-status-ativo` (fix ainda não deployado).
