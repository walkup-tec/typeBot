# LOG 2026-06-04 — Handoff CLT: Redirect → {{url_direct}}

## Sintoma
Lead no fluxo `empr-stimo-do-trabalhador-clt-lvgj2gl` vê erro MinIO (NoSuchKey / path `typebot/typebot/public/...`) em vez da tela `handoff-view`.

## Diagnóstico
- `POST https://app.chattypebot.com/api/typebot/handoff` retorna `url_direct` → `https://app.chattypebot.com/handoff-view?...` (OK).
- `GET /handoff-view?...` → HTTP 200 (OK).
- Viewer publicado: favicon/logo MinIO em path **correto** (`typebot/public/branding/...`).
- Causa provável: bloco **Redirect** do Typebot ainda com URL de imagem MinIO ou variável de avatar, não `{{url_direct}}`.

## Correção código
- `typebot-builder.service.ts`: patch automático do bloco `Redirect` → `{{url_direct}}` quando URL é MinIO/imagem/ path duplicado.
- `typebot-media-repair.service.ts`: repair de mídia aplica `applyHandoffPatchesToTypebotSchema` + publica fluxo.
- Marker: `DEPLOY-2026-06-04-handoff-redirect-url-direct`

## Pós-deploy (obrigatório)
1. Redeploy serviço **api** no Easypanel.
2. Master Console → assinante Soma → **Sincronizar workspace Typebot** (ou `POST /api/master/tenants/1f992ff8-741b-451d-b3c8-bb08ec1ba92a/flows/sync-workspace`).
3. Validar `/health` → `deployMarker` novo + `masterLibraryLogicVersion: handoff-redirect-url-direct-v31`.
4. Testar fluxo até fila ao vivo; URL final deve ser `app.chattypebot.com/handoff-view`.

## Typebot (conferência manual)
- Webhook POST → `https://app.chattypebot.com/api/typebot/handoff`
- Mapeamento resposta → `url_direct`
- Redirect → `{{url_direct}}` (não URL de imagem)
