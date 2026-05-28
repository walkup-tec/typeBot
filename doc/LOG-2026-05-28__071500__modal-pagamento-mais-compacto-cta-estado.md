# LOG 2026-05-28 07:15 — Modal pagamento mais compacto + CTA por estado

## Chats/solicitações abertas

- Diminuir ainda mais os botões de forma de pagamento.
- Diferenciar cor do botão Confirmar pagamento quando inativo vs ativo.

## Arquivos alterados

- `apps/sales/src/components/sales/PaymentMethodSelector.tsx`
- `apps/sales/src/routes/index.tsx`
- `_pv-typebot-chat-temp/src/components/sales/PaymentMethodSelector.tsx` (sync)
- `_pv-typebot-chat-temp/src/routes/index.tsx` (sync)
- `doc/memoria.md`

## Comandos executados

- Cópia dos arquivos atualizados do monorepo para `_pv-typebot-chat-temp`.

## Resultado de validações

- Ajuste visual aplicado sem alterar regra de negócio.
- CTA segue bloqueado até formulário completo e método escolhido.

## Pendências para retomada

- Commit/push e deploy da `paginadevendas`.
