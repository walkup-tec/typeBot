# LOG 2026-05-27 11:50 — Ajuste de preço assinatura (Asaas)

## Solicitação
Primeira alteração da retomada Asaas: atualizar preço para `R$ 290,00 mensal` e `R$ 190,00 anual` (economia `R$ 1.200,00`).

## Interpretação aplicada
- Para manter coerência de cobrança anual com `R$ 190,00/mês` e economia de `R$ 1.200,00`:
  - **Mensal:** `R$ 290,00`
  - **Anual total:** `R$ 2.280,00`
  - Economia: `290 * 12 - 2280 = 1200`

## Arquivos alterados
- `apps/api/src/billing/billing-plans.ts`
- `apps/sales/src/routes/index.tsx`
- `.env.example`
- `doc/EASYPANEL-AMBIENTE.env.example`
- `doc/memoria.md`

## Comandos executados
- Leitura de arquivos de pricing/env
- Verificação de lints nos arquivos alterados

## Validação
- `ReadLints` sem erros para:
  - `apps/api/src/billing/billing-plans.ts`
  - `apps/sales/src/routes/index.tsx`

## Pendências
- Se aprovado, criar commit e push.
- Atualizar variáveis no Easypanel API:
  - `SALES_PLAN_MONTHLY_VALUE=290.00`
  - `SALES_PLAN_YEARLY_VALUE=2280.00`

