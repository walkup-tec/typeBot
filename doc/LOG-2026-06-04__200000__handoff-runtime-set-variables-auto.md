# LOG 2026-06-04 — Variáveis handoff automáticas no Set variable

## Contexto
- Usuário define no fluxo matriz blocos **Set variable** com `tenantId`, `sourceFlowLabel`, `viewer_url` fixos (Drax/matriz).
- Novos assinantes recebem cópia do fluxo; precisam assumir IDs/URL do tenant alvo.

## Alterações
- `apps/api/src/typebot/typebot-handoff-runtime-variables.service.ts` — patch blocos `Set variable` por nome da variável.
- `apps/api/src/typebot/typebot-builder.service.ts` — integra no `patchHandoffWebhookAndRedirectConfig`; `applyTenantMetadata` já passa `tenantId`.
- `apps/api/src/deploy-marker.ts` — `DEPLOY-2026-06-04-handoff-runtime-set-variables`, `handoff-runtime-vars-v34`.

## Comportamento
- Import/sync/repair/publicação: ao rodar `patchHandoffWebhookOnTarget` ou `applyHandoffPatchesToTypebotSchema` com `publicId`, preenche:
  - `tenantId` → `tenant.id`
  - `sourceFlowLabel` → `publicId` do typebot no workspace do assinante
  - `viewer_url` / `typebotViewerUrl` → URL viewer montada com base do target
- Na importação (antes do `publicId`): só `tenantId` é aplicado; label/URL no passo seguinte (`patchHandoffWebhookOnTarget`).

## Validação local
- `npm run build` em `apps/api` — OK.

## Pendências
- Redeploy API Easypanel; `/health` → marker novo.
- Soma (ou tenant): Master Console Etapa 6 → **Atualizar lista** (sync + patch + publish).
- Conferir no builder: 3 blocos Set variable com valores do assinante, não da matriz.
