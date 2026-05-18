# Snapshot — prioridades etapa 4 Master Console

**Data:** 2026-05-18 12:08

## Solicitação

Configurar Prioridade no console: input para nomes; padrão Alta, Média, Baixa; editar padrões e adicionar novas.

## Arquivos

- `apps/api/src/priorities/*` (repository, service, routes, defaults)
- `apps/api/src/lib/repositories.ts`, `server.ts`, `tenants/tenant.service.ts`, `tenants/tenant.routes.ts`
- `apps/admin/src/TenantPrioritiesStep.tsx`, `App.tsx`, `styles.css`
- `doc/memoria.md`

## Validação

- Linter OK nos ficheiros alterados.

## Deploy

Redeploy **api-typebot-crm** e **painel-typebot-crm**.
