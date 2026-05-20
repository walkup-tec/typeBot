# LOG 2026-05-20 — fix tela do lead handoff

## Sintoma
Chat do atendente carrega na Fila ao vivo; tela do lead não.

## Causas
1. `handoffUrl` com `https://api.chattypebot.com` (env) — host sem DNS; lead não abre página.
2. Visitante só habilitava chat com `status === in_service"`; atraso no polling.
3. `tenantId` na query podia divergir do contato na fila.

## Correção (`queue.routes.ts`)
- `canonicalizeHandoffPublicBase`: `api.chattypebot.com` → `app.chattypebot.com`
- POST handoff: `getPublicBaseUrl` com Host da requisição
- handoff-view: tenantId do contato na fila primeiro; estado inicial do chat visitante
- `shouldEnableVisitorLiveChat`: `in_service` ou `waiting` com atendente atribuído

## Deploy
- API `api-typebot-crm`
- Easypanel env: `HANDOFF_PUBLIC_BASE_URL=https://app.chattypebot.com`
