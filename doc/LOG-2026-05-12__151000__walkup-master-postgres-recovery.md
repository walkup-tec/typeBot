# Snapshot — login/reset walkup 401/404

**Data:** 2026-05-12

## Sintoma

- Login `walkup@walkuptec.com.br` → 401; reset → 404 (API ligação OK).

## Causa

- Postgres de produção sem tenant/atendente master walkup.

## Alterações

- `apps/api/src/auth/system-master-auth.ts`
- `apps/api/src/bootstrap/ensure-system-master-auth.ts`
- `auth.routes.ts`, `server.ts`, `doc/EASYPANEL-AMBIENTE.env.example`

## Validação

- `npm run build:api` — OK.

## Pendência

- Redeploy API com env de recuperação; depois reset/login no painel.
