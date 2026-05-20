# LOG 2026-05-20 — fix handoff GET redirect Typebot

## Solicitação
Redirecionamento para `https://app.chattypebot.com/api/typebot/handoff` não funcionava.

## Causa raiz
- Bloco **Redirect** do Typebot navega com **GET**.
- API expunha apenas `POST /api/typebot/handoff` → **404** no browser.

## Alterações
- `apps/api/src/queue/queue.routes.ts`
  - Handler unificado `handleTypebotHandoff`
  - `GET /api/typebot/handoff` → 302 para `handoffUrl`
  - `mergeHandoffRequestInput` para query string
  - `getPublicBaseUrl(req, preferRequestHost)` no GET usa host da requisição

## Validação local
- Lint OK em `queue.routes.ts`

## Validação produção (pendente pós-deploy)
```bash
curl -sI "https://app.chattypebot.com/api/typebot/handoff?contactName=Teste&sourceFlowLabel=drax-sistemas-d3hpop9"
# Esperado: HTTP/2 302 + Location: .../handoff-view?...
```

## Config Typebot recomendada
1. **HTTP Request (POST)** → `TYPEBOT_HANDOFF_WEBHOOK_URL` (ex. `https://app.chattypebot.com/api/typebot/handoff`)
2. Mapear resposta → variável `url_direct`
3. **Redirect** → `{{url_direct}}` (não a URL do webhook)

## Pendências
- Deploy `api-typebot-crm` com este commit
- Confirmar `HANDOFF_PUBLIC_BASE_URL` alinhado ao domínio público desejado para POST/webhook
