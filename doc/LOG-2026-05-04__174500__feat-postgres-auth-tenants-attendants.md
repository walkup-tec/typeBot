# LOG: Postgres para tenants/attendants (login estável entre deploys)

## Pedido

Garantir que o problema de login **não volte** num SaaS: além de volume/seed, persistência de identidade fora do disco do contentor.

## Solução

1. **`DATABASE_URL`**: com esta variável, tenants e attendants gravam-se em **PostgreSQL** (`saas_tenants`, `saas_attendants`, JSONB por linha). Redeploy da API não apaga utilizadores.
2. **Migração automática**: se Postgres vazio e existirem `tenants.json` / `attendants.json` no volume, cópia única para Postgres ao arranque.
3. **Bootstrap async** (`bootstrap/auth-data-bootstrap.ts`): schema, migração, `hydrate` nos repositórios antes de `app.listen`.
4. **Persistência assíncrona em fila**: após cada mutação em memória, `schedulePersistTenants` / `schedulePersistAttendants` (replace tabela em transação).
5. **`reloadFromStorage()`** no `AttendantRepository` + uso em login/reset/seed para Postgres.
6. **Produção**: `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION` e aviso se só JSON; `GET /health` com `authTenantsAttendants`.
7. **Build**: `@types/node` fixado em devDependency (^20.14.10); casts `Uint8Array` em `scryptSync`/`timingSafeEqual` para compat TS 5.7 + tipos Node 20.

## Ficheiros principais

- `apps/api/src/lib/auth-postgres.ts` (novo)
- `apps/api/src/bootstrap/auth-data-bootstrap.ts` (novo)
- `apps/api/src/tenants/tenant.repository.ts`, `apps/api/src/attendants/attendant.repository.ts`
- `apps/api/src/server.ts`, `apps/api/src/auth/auth.routes.ts`, `apps/api/src/bootstrap/seed-tenant-on-empty.ts`
- `apps/api/package.json` (`pg`, `@types/pg`, `@types/node` em devDependencies)
- `doc/EASYPANEL-AMBIENTE.env.example`, `doc/POSTGRES-AUTH-TENANTS-ATTENDANTS.md`

## Como validar

- Local sem `DATABASE_URL`: `npm run build:api`; arranque; login com JSON habitual.
- Com Postgres: definir `DATABASE_URL`, `npm run build:api`, arranque; `GET /health` → `authTenantsAttendants: "postgres"`; criar assinante e redeploy — login mantém-se.

## Segurança

- `DATABASE_URL` com credenciais: apenas em secrets do Easypanel; não commitar.

## Palavras-chave

`DATABASE_URL`, `saas_tenants`, `saas_attendants`, `auth-postgres`, `hydrate`, `reloadFromStorage`
