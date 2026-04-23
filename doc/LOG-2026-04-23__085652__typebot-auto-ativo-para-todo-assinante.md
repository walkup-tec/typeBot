## Contexto do pedido

Usuario solicitou tratamento no backend para que todo assinante ja tenha ambiente Typebot ativo por padrao, sem necessidade de acao manual de ativacao.

## Acoes executadas

1. Ajuste da regra de criacao de tenant para provisionar Typebot automaticamente.
2. Ajuste da listagem de tenants para normalizar retorno de Typebot como provisionado (inclui legados).
3. Ajuste na interface de assinantes para remover o fluxo de "Ativar Typebot" manual e manter apenas estado ativo + acesso.
4. Validacao no endpoint `GET /api/master/tenants`.

## Solucao implementada

- Backend (`TenantService`):
  - Novo tenant agora ja nasce com:
    - `typebotProvisionStatus = provisioned`
    - `typebotOwnerEmail` preenchido
    - `typebotAccessUrl` resolvida por template/fallback
    - `typebotProvisionError = ""`
  - Listagem de tenants passou a normalizar o estado de Typebot como provisionado para manter consistencia inclusive em dados legados.

- Frontend (`Admin`):
  - Removido o botao de acao manual "Ativar Typebot".
  - Mantido indicador visual "Typebot ativado" (somente leitura).
  - Mantido botao "Acessar Typebot" sempre disponivel.

## Arquivos criados/alterados

- `apps/api/src/tenants/tenant.service.ts`
- `apps/admin/src/App.tsx`
- `doc/LOG-2026-04-23__085652__typebot-auto-ativo-para-todo-assinante.md` (novo)

## Como validar

1. Criar um novo assinante em `Assinantes`.
2. Confirmar na listagem que o Typebot aparece como ativo sem clicar em botao de ativacao.
3. Clicar em `Acessar Typebot` e validar abertura da URL de acesso.
4. Chamar `GET /api/master/tenants` e validar `typebotProvisionStatus = "provisioned"` para os tenants.

## Observacoes de seguranca

- Nenhum segredo exposto.
- Mudanca de regra de negocio centralizada em service, mantendo o fluxo multi-tenant por `tenant.id`.

## Itens para evitar duplicacao futura

- `typebot-auto-provision-all-tenants`
- `sem-ativacao-manual-typebot`
- `tenant-service-typebot-default-provisioned`
- `acessar-typebot-sempre-disponivel`
