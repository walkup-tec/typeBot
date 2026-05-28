# LOG 2026-05-28 07:23 — Fix Asaas Checkout 404

## Chats/solicitações abertas

- Erro no modal: `Falha na integração Asaas (404)`.

## Arquivos alterados

- `apps/api/src/billing/asaas.client.ts`
- `doc/memoria.md`

## Comandos executados

- Build API: `npm run build:api` (ok).
- Verificação de lint no arquivo alterado (sem erros).

## Resultado de validações

- Endpoint corrigido de `/checkoutSessions` para `/checkouts`.
- Build TypeScript da API concluído com sucesso.

## Pendências para retomada

- Commit/push do fix.
- Deploy do serviço `api-typebot-crm` no Easypanel.
- Retestar modal de assinatura.
