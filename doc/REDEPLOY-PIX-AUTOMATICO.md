# Redeploy — Pix Automático (só isto no Easypanel)

Código já commitado. **Você só precisa redeployar** estes dois serviços (ordem sugerida):

1. **API** (`api-typebot-crm` / `apps/api`) — pull do Git + **Deploy**
2. **Landing** (`paginadevendas` / `apps/sales`) — pull do Git + **Deploy** (build com `VITE_API_BASE_URL` e `VITE_PAINEL_URL`)

## Depois do redeploy (teste rápido)

- `GET https://api.chattypebot.com/api/public/sales/plans` → `paymentConfigured: true`
- Na landing: plano **mensal** → **Pix** → deve abrir `/pagamento` com QR

## Já deve existir na API (Easypanel)

Se o checkout já funcionava com cartão, mantenha:

- `ASAAS_API_KEY`
- `ASAAS_API_BASE_URL`
- `ASAAS_WEBHOOK_ACCESS_TOKEN`
- `SALES_PLAN_*`

Webhook Asaas: `POST https://api.chattypebot.com/api/webhooks/asaas` (eventos de pagamento + Pix Automático).

## Conta Asaas

Pix Automático na assinatura mensal exige conta **PJ** com recurso habilitado no Asaas (sandbox ou produção conforme a chave da API).
