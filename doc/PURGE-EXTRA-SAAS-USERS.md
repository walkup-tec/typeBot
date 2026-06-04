# Purga — manter só Walkup e Drax

Únicos logins/assinantes permitidos:

| Nome | E-mail |
|------|--------|
| Master Walkup | `walkup@walkuptec.com.br` |
| Drax Sistemas | `draxsistemas@gmail.com` |

## Produção (API com endpoint `purge-extra-users`)

Após deploy da API com este endpoint:

```bash
curl -sS -X POST "https://app.chattypebot.com/api/master/system/purge-extra-users"
```

Ou, no container da API:

```bash
curl -sS -X POST "http://127.0.0.1:3333/api/master/system/purge-extra-users"
```

Remove: tenants com outro `ownerEmail`, atendentes extras, fluxos/fila/labels/prioridades/kanban de tenants apagados, pedidos de billing de outros e-mails, `flow-library.json` legado.

## Postgres (manual, se necessário)

```sql
SELECT id, data->>'ownerEmail' AS email FROM saas_tenants;
SELECT id, data->>'username' AS u, tenant_id FROM saas_attendants;
```

Apague linhas que não sejam os dois e-mails acima (ou use o endpoint após deploy).

## Repositório / seed

- `apps/api/data-seed/tenant-id-map.json` — só os dois e-mails
- `apps/api/data-seed/saved-flows.json` — só `tenantId` Walkup e Drax

Backups em `backups/` não são alterados (histórico).

## Typebot (workspaces)

Workspaces antigos (Ideal Cred, Mozart, etc.) podem continuar no servidor Typebot; a purga SaaS não apaga bots remotos. Remova manualmente no builder se quiser.
