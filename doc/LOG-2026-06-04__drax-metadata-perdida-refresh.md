# LOG 2026-06-04 — Drax: descrição/imagem Metadados somem ao atualizar

## Sintoma
- Ícone (DRAX) persiste no Typebot
- Imagem OG + descrição voltam ao default do Typebot após F5

## Causa
`applyTenantIconOnTarget` fazia PATCH com `settings: { metadata: { favIconUrl } }` apenas.
A API do Typebot substitui `settings.metadata` inteiro → apaga `description`, `imageUrl`, `title`.

Disparado em sync de fluxos padrão (`applyTenantIconOnTarget` após import/sync).

## Fix
- `mergeTypebotSettingsMetadata` em `typebot-share-metadata.service.ts`
- `applyTenantIconOnTarget` faz GET + merge + PATCH

## Deploy
Marker: `DEPLOY-2026-06-04-preserve-typebot-share-metadata`
