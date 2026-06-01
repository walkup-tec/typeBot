# Redeploy — Pix Automático (só isto no Easypanel)

| Serviço Easypanel | Repositório | Commit (Pix Automático) |
|-------------------|-------------|-------------------------|
| **api-typebot-crm** | `walkup-tec/typeBot` (`master`) | `b833624` (ou ≥ `59869d2`) |
| **paginadevendas** | `walkup-tec/PV-typebot-chat` (`main`) | `709dadc` |

**Você só precisa redeployar** (um passo de cada vez conforme combinado).

## Depois do redeploy (teste rápido)

- `GET https://app.chattypebot.com/api/public/sales/plans` → `paymentConfigured: true` **e** `billingCapabilities.version: "2026-06-01-pix-automatic"`
- Se **não** aparecer `billingCapabilities`, a API em produção ainda é a versão antiga (erro RECURRENT + PIX).
- Na landing: plano **mensal** → **Pix** → deve abrir `/?orderId=...&pix=1` com QR

## Já deve existir na API (Easypanel)

Se o checkout já funcionava com cartão, mantenha:

- `ASAAS_API_KEY`
- `ASAAS_API_BASE_URL`
- `ASAAS_WEBHOOK_ACCESS_TOKEN`
- `SALES_PLAN_*`

Webhook Asaas: `POST https://api.chattypebot.com/api/webhooks/asaas` (eventos de pagamento + Pix Automático).

## Conta Asaas

Pix Automático na assinatura mensal exige conta **PJ** com recurso habilitado no Asaas (sandbox ou produção conforme a chave da API).
