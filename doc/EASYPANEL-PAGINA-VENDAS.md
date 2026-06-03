# Easypanel — serviço `paginadevendas`

## Repositório correto

| Campo | Valor |
|--------|--------|
| GitHub | `https://github.com/walkup-tec/PV-typebot-chat` |
| Branch | `main` |
| Root directory | `.` (raiz do repo) |

**Não** usar `walkup-tec/typeBot` com `apps/sales` neste serviço, a menos que você reconfigure o app no Easypanel para apontar ao monorepo.

O monorepo `typebot-Saas` / `typeBot` mantém `apps/sales` em paralelo; mudanças lá **não** entram no ar até serem copiadas/sincronizadas para `PV-typebot-chat` e dar push.

## Build (Nixpacks)

- Install: `npm ci --include=dev` (ver `nixpacks.toml`)
- Build: `npm run build` (roda `scripts/check-prod-vite-api.mjs` + Vite)
- Start: `npm start` ou `npm run start:static` → `scripts/serve-production.mjs`

## Variáveis de ambiente (build)

```env
VITE_API_BASE_URL=https://app.chattypebot.com
VITE_PAINEL_URL=https://painel.chattypebot.com
```

O build **rejeita** `api.chattypebot.com` (host descontinuado).

## Runtime

```env
PORT=3000
HOST=0.0.0.0
```

## Validar deploy

1. Log do Easypanel: commit recente.
2. Checkout: DevTools → rede → chamadas para `app.chattypebot.com/api/public/sales/...`.
3. `GET https://app.chattypebot.com/api/public/sales/plans` → JSON com planos.

## API (serviço Easypanel `api`)

Checkout e preços dinâmicos dependem da API com billing/Asaas no domínio **`app.chattypebot.com`**.

Paridade de env/volume: `doc/EASYPANEL-PARIDADE-SERVICO-API.md`.
