# `api.chattypebot.com` — descontinuado

**Não use** este subdomínio no projeto atual.

| Uso | URL correta |
|-----|-------------|
| API Node (health, login, billing, Biblioteca Master) | `https://app.chattypebot.com` |
| Painel admin | `https://painel.chattypebot.com` |
| Landing / checkout | `https://chattypebot.com` (serviço `paginadevendas`) |

## Serviço Easypanel

- API: serviço **`api`** (não existe mais `api-typebot-crm`).
- Build do painel e da landing: `VITE_API_BASE_URL=https://app.chattypebot.com`.

## Validação

```text
https://app.chattypebot.com/health
```

JSON com `"status":"ok"` e `deployMarker` recente.

## Histórico

Tentativa de DNS `api.chattypebot.com` (mai/2026) foi substituída por `app.chattypebot.com`. Logs antigos em `doc/LOG-2026-05-27__dns-api-chattypebot-nxdomain.md`.
