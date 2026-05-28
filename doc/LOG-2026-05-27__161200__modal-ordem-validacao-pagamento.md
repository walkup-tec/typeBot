# LOG 2026-05-27 16:12 — Modal pagamento (ordem e validação)

## Chats/solicitações abertas

- Mover opções Pix/Cartão para o final do modal.
- Bloquear botão até preencher inputs e selecionar forma de pagamento.

## Arquivos alterados

- `apps/sales/src/routes/index.tsx`
- `apps/sales/src/components/sales/PaymentMethodSelector.tsx`
- `_pv-typebot-chat-temp/src/routes/index.tsx` (sync)
- `_pv-typebot-chat-temp/src/components/sales/PaymentMethodSelector.tsx` (sync)
- `doc/memoria.md`

## Comandos executados

- Cópia dos arquivos atualizados do monorepo para `_pv-typebot-chat-temp`.

## Resultado de validações

- Validação lógica aplicada no front: botão desabilitado até formulário completo e método escolhido.
- Sem execução de build neste ajuste pontual.

## Pendências para retomada

- Deploy de `paginadevendas` para publicar a nova UX.
- Opcional: commit/push do ajuste, se solicitado.
