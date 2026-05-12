# Snapshot - correcao deploy painel lead

## Contexto

- Usuario reportou que nenhuma mudanca pedida apareceu em producao.
- Causa: alteracoes estavam apenas no working tree local, sem commit/push/deploy.

## Arquivos desta entrega

- `apps/api/src/lib/agent-session-meta.ts`
- `apps/api/src/queue/queue.routes.ts`
- `apps/api/src/queue/queue.service.ts`
- `apps/api/src/typebot/typebot-builder.service.ts`
- `apps/widget/src/LeadDrawerPanel.tsx`
- `apps/widget/src/WidgetApp.tsx`
- `apps/widget/src/agentSessionMeta.ts`
- `apps/widget/src/resolveAttendantDisplayName.ts`
- `apps/widget/src/resolveLeadWhatsapp.ts`

## Validacao local

- `npm run build:api` OK.

## Pendencias

- Commit/push e redeploy de `api-typebot-crm` e `widget-typebot-crm`.
- Novo handoff apos deploy para validar painel do lead.
