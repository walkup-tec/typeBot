# Postgres para login (tenants + attendants)

## Objetivo

Evitar perda de **utilizadores e assinantes** quando o contentor Docker da API é redeployado: esses dados passam a viver num serviço **Postgres** (persistente no Easypanel), não só no disco efémero do contentor.

## Como ativar

1. Cria um serviço **PostgreSQL** no Easypanel (ou usa um gerido).
2. No serviço da **API**, define `DATABASE_URL` com a URL JDBC/Postgres (ex.: `postgresql://user:pass@nome-do-servico:5432/dbname`).
3. Faz deploy da API. No arranque:
   - cria as tabelas `saas_tenants` e `saas_attendants` se não existirem;
   - carrega os dados para memória;
   - se o Postgres estiver **vazio** mas existirem `tenants.json` / `attendants.json` no disco, **copia-os uma vez** para o Postgres.

## O que continua em JSON

Fluxos salvos, fila, bibliotecas, etc. continuam em `apps/api/data/` até haver migração explícita. Para não perder esses dados entre deploys, mantém **volume** em `apps/api/data` ou backups.

## Variáveis úteis

| Variável | Efeito |
|----------|--------|
| `DATABASE_URL` | Ativa Postgres para tenants + attendants. |
| `DATABASE_POOL_MAX` | Limite de ligações no pool (default 10). |
| `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION` | `true`: em `NODE_ENV=production` exige `DATABASE_URL` (ou `AUTH_ALLOW_JSON_IN_PRODUCTION=true`). |
| `AUTH_ALLOW_JSON_IN_PRODUCTION` | `true`: suprime o aviso e permite JSON em produção (ex.: com volume). |

## Health

`GET /health` inclui `authTenantsAttendants`: `"postgres"` ou `"json"`.

## Palavras-chave

`saas_tenants`, `saas_attendants`, `auth-postgres`, `bootstrapAuthDataFromDatabase`, `DATABASE_URL`
