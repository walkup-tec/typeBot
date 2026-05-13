# Snapshot — 2026-05-13 salesApi erro API HTTPS

## Contexto

- Utilizador: "Sem conexão com a API (https://api.chattypebot.com)..."

## Diagnóstico

- URL correta no bundle; `fetch` falha (rede). Teste externo: `api.chattypebot.com` sem resolução DNS nesse ambiente.

## Alteração

- `apps/sales/src/lib/salesApi.ts`: mensagem no catch com passos `/health`, DNS, TLS, Easypanel.

## Deploy

- Opcional: redeploy LP para nova cópia da mensagem. Prioridade: **DNS + API no ar** para `api.chattypebot.com`.
