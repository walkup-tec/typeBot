# Snapshot — handoff redirect patch v6 (Soma)

**Data:** 2026-06-05  
**Pedido:** Viewer Soma sem erro, mas não redireciona para handoff-view.

## Diagnóstico

- API handoff (v5) retorna `tenantId` Soma e `url_direct` corretos.
- Bloqueio no **schema publicado** do Typebot do assinante: Redirect/webhook/mapping não alinhados.

## Alterações

- `apps/api/src/typebot/typebot-builder.service.ts` — patch agressivo assinante, `url_direct`, diagnóstico.
- `apps/api/src/typebot/typebot-subscriber-handoff-repair.service.ts` — repair por tenant.
- `apps/api/src/flows/flow.routes.ts` — `POST /api/master/tenants/:tenantId/typebot/repair-handoff`.
- `apps/api/src/deploy-marker.ts` — v6.

## Validação local

- `npx tsc --noEmit` em `apps/api` — OK.

## Pendências

1. Deploy serviço `api` (marker v6 em `/health`).
2. Repair Soma (`1f992ff8-741b-451d-b3c8-bb08ec1ba92a`).
3. Teste viewer `empr-stimo-do-trabalhador-clt-bxn7orp`.
