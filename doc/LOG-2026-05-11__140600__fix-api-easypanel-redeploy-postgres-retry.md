# Snapshot - API Easypanel vermelho no redeploy

## Contexto

- Usuario reportou redeploy da API no Easypanel com servico vermelho.
- `GET /health` publico respondeu "Service is not started".

## Diagnostico local

- `npm run build:api` OK apos `npm install`.
- Arranque com `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION=true` sem `DATABASE_URL` encerra com exit 1.
- `DATABASE_URL` invalido derruba a API no bootstrap do Postgres.

## Correcao aplicada

- `apps/api/src/bootstrap/auth-data-bootstrap.ts`: retry de conexao Postgres no arranque (6 tentativas, 2.5s) e log orientando Easypanel.

## Pendencias

- commit/push e novo deploy no Easypanel.
- Validar env: `DATABASE_URL` ou `AUTH_ALLOW_JSON_IN_PRODUCTION=true` se nao usar Postgres.
- Conferir logs do servico apos deploy.
