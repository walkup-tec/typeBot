# Snapshot — Pix Automático assinatura mensal

## Contexto

- Pedido: implementar Pix Automático (Asaas) para cobrança mensal recorrente na landing de vendas.
- Chat aberto: integração billing + UI pagamento.

## Arquivos alterados

- `apps/api/src/billing/asaas-pix-automatic.client.ts` (novo)
- `apps/api/src/billing/billing-dates.ts` (novo)
- `apps/api/src/billing/pix-automatic-renewal.service.ts` (novo)
- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/billing/billing-order.repository.ts`
- `apps/api/src/billing/billing.routes.ts`
- `apps/api/src/server.ts`
- `apps/sales/src/routes/pagamento.tsx` (novo)
- `apps/sales/src/lib/salesApi.ts`
- `apps/sales/src/routes/index.tsx`
- `apps/sales/src/components/sales/PaymentMethodSelector.tsx`
- `doc/EASYPANEL-AMBIENTE.env.example`

## Comportamento

- Plano **mensal + PIX**: cria autorização Pix Automático (Jornada 3), retorna QR/copia-e-cola, redireciona para `/pagamento`.
- Plano **anual + PIX**: mantém cobrança Pix avulsa (`pix_single`).
- **Cartão**: checkout recorrente Asaas inalterado.
- Modo padrão `BILLING_PIX_AUTOMATIC_PAYMENT_MODE=SUBSCRIPTION` (Asaas gera renovações).
- Modo `MANUAL` + job no `server.ts` cria cobranças 2–10 dias úteis antes do vencimento.
- Webhooks: eventos de autorização Pix Automático + pagamentos/renovações/inadimplência.

## Validação

- `apps/api`: `npx tsc --noEmit` OK.
- `apps/sales`: `npm run build` OK (rota `/pagamento` no routeTree).

## Pendências operacionais

1. Conta Asaas PJ com **Pix Automático** habilitado (sandbox/produção).
2. Webhook `POST /api/webhooks/asaas` com eventos de Pix Automático e `ASAAS_WEBHOOK_ACCESS_TOKEN`.
3. Teste E2E: assinar mensal PIX → pagar QR → provisionar tenant → renovação (sandbox).
4. Se 404 na autorização, ajustar `ASAAS_PIX_AUTOMATIC_AUTH_PATH` ou conferir fallback `/pix/automaticRecurringAuthorizations`.
