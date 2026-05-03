# Contexto

Redirect no Typebot não abria a URL do handoff (`{{url_direct}}` vazio ou link inválido).

# Causas prováveis

1. Mapeamento do Webhook com `bodyPath` tipo `data.urlFlat` enquanto o Redirect usa variável `url_direct`.
2. Resposta **201** ou JSON sem chave `url_direct` na raiz (pickers antigos).
3. `handoffUrl` gerado com host **localhost** ou host interno porque o pedido chega via túnel sem `HANDOFF_PUBLIC_BASE_URL`.

# Alterações

- `POST /api/typebot/handoff`: status **200**, campos **`url_direct`** na raiz e em **`data.url_direct`**.
- `HANDOFF_PUBLIC_BASE_URL` no `.env` (override da base usada em links do handoff).
- `patchHandoffWebhookAndRedirectConfig`: blocos **Webhook** e **HTTP Request** (nome); normalização de `bodyPath` de URLs para **`url_direct`**; só altera blocos que já têm `options.webhook` objeto.

# Ficheiros

- `apps/api/src/queue/queue.routes.ts`
- `apps/api/src/typebot/typebot-builder.service.ts`
- `.env.example`

# Validar

1. Definir `HANDOFF_PUBLIC_BASE_URL` se o Typebot usar túnel.
2. No Webhook, mapear variável **`url_direct`** com body path **`url_direct`** (ou deixar sync/patch atualizar caminhos antigos).
3. Redirect com `{{url_direct}}`.
4. Republicar fluxo após sync ou guardar no builder.

# Palavras-chave

- `url_direct`
- `HANDOFF_PUBLIC_BASE_URL`
- `typebot-redirect-handoff`
