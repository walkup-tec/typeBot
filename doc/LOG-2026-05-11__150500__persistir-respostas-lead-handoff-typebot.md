# Snapshot - persistir respostas do lead no handoff Typebot

## Solicitacao aberta

- Salvar no atendimento as informacoes que o lead informou ao responder o fluxo Typebot.

## Diagnostico

- Fila producao `tenant_drax`: contatos com `leadContext` e `leadWhatsapp` nulos.
- Webhook do fluxo Drax Sistemas (`cmopzmivk0025ru1czpx5k4a3`) enviava apenas metadados do handoff, sem variaveis do fluxo.

## Alteracoes

- `apps/api/src/queue/queue.routes.ts`: merge de contexto (`leadContext`, `variables`, `answers`, campos extras); `leadWhatsapp` no enqueue; nome do lead a partir do contexto.
- `apps/api/src/queue/queue.service.ts`: `leadWhatsapp` no schema/enqueue.
- `apps/api/src/typebot/typebot-builder.service.ts`: injecao automatica de variaveis do typebot no body do webhook de handoff.

## Comandos

- `npm run build:api` (OK)
- Patch manual do webhook Drax no builder (PATCH 200; publish `/publish` 415; `published:true` PATCH 200)

## Validacao

- Build da API compilou sem erros.
- API local nao iniciou: Postgres indisponivel (`ECONNREFUSED` com `DATABASE_URL` do `.env`).
- Body do webhook Drax no builder passou a incluir `WhatsApp`, `email`, `categoria`, etc.

## Pendencias

- Redeploy da API em producao.
- Novo handoff real e conferencia no painel do atendente.
- Republicar viewer do fluxo Drax se o handoff ainda nao refletir o body novo.
