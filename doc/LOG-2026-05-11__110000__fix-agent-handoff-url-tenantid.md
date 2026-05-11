# Snapshot — handoff do atendente sem tenantId

## Solicitacao

- Link de atendimento do agente abria "Sessao indisponivel" em vez do chat.

## Arquivos alterados

- `apps/admin/src/App.tsx`
- `doc/memoria.md`
- `doc/LOG-2026-05-11__110000__fix-agent-handoff-url-tenantid.md`

## Validacao

- `npm run build:admin`: OK.
- Producao: handoff com `tenantId=tenant_drax` abre chat; sem tenantId falha.

## Pendencia

- Redeploy do painel CRM.
