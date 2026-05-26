# LOG 2026-05-26 — Integração landing + Asaas

## Solicitação
Retomar integração da landing page (`chattypebot.com`) com Asaas.

## Alterações
- `apps/api/src/server.ts` — registra `registerBillingRoutes`.
- `apps/api/src/billing/*` — módulo completo (commit).
- `billing.service.ts` — `asaasPaymentId` na assinatura; reconciliação por subscription.
- `apps/sales/src/lib/salesApi.ts` — `fetchSalesPlans`.
- `apps/sales/src/routes/index.tsx` — preços dinâmicos + bloqueio se pagamento não configurado.
- `.env.example` / `EASYPANEL-AMBIENTE.env.example` — valores 190 / 1188.

## Fluxo
Landing → `POST /api/public/sales/subscriptions` → Asaas checkout → webhook → provisiona tenant.

## Validação local
- `npm run build:api` — OK.

## Pendências deploy
1. API Easypanel: `ASAAS_API_KEY`, sandbox ou prod, webhook token, `SALES_PLAN_*`, `SYSTEM_LOGIN_URL`.
2. Webhook no painel Asaas apontando para `/api/webhooks/asaas`.
3. Rebuild **api-typebot-crm** + **landing** (chattypebot.com).
4. Teste: `GET /api/public/sales/plans` → `paymentConfigured: true`.
