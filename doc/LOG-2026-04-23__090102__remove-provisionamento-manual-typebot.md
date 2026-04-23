## Contexto do pedido

Usuario solicitou remover o provisionamento manual de Typebot no backend e remover o botao de ativacao no frontend.

## Acoes executadas

1. Remocao da rota manual `POST /api/master/tenants/:id/typebot/provision`.
2. Remocao do metodo de service usado apenas por essa rota.
3. Remocao no frontend do botao de ativacao Typebot na lista de assinantes.
4. Limpeza de codigo nao utilizado relacionado a capacidades Typebot no frontend.
5. Validacao com linter nos arquivos alterados.

## Solucao implementada

- Backend:
  - Endpoint manual de provisionamento removido.
  - Fluxo agora fica 100% no modelo automatico ja implementado para todos os assinantes.

- Frontend:
  - Botao `Ativar Typebot` removido da tela de assinantes.
  - Mantido apenas botao `Acessar Typebot`.
  - Estado/funcoes de `typebotCapabilities` removidos por nao serem mais necessarios nesta tela.

## Arquivos criados/alterados

- `apps/api/src/tenants/tenant.routes.ts`
- `apps/api/src/tenants/tenant.service.ts`
- `apps/admin/src/App.tsx`
- `doc/LOG-2026-04-23__090102__remove-provisionamento-manual-typebot.md` (novo)

## Como validar

1. Abrir tela `Assinantes` e confirmar que nao existe mais botao `Ativar Typebot`.
2. Confirmar que existe apenas `Acessar Typebot`.
3. Chamar `POST /api/master/tenants/:id/typebot/provision` e confirmar que a rota nao existe mais.

## Observacoes de seguranca

- Sem exposicao de segredos.
- Regra de provisionamento centralizada no fluxo automatico.

## Itens para evitar duplicacao futura

- `remove-provisionamento-manual-typebot`
- `sem-botao-ativar-typebot-front`
- `tenant-typebot-auto`
