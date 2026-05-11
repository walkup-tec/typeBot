# Snapshot - painel dados lead atendente

## Chats / solicitacoes abertas

- Painel lateral de dados do lead no chat do atendente (icone ao lado do nome).

## Arquivos alterados

- `apps/api/src/queue/queue.routes.ts`
- `apps/api/src/queue/queue.service.ts`
- `apps/api/src/queue/queue.repository.ts`
- `apps/widget/src/WidgetApp.tsx`
- `apps/widget/src/widget.css`
- `doc/memoria.md`

## Comandos executados

- `node tmp-patch-lead-drawer.mjs` (HTML do drawer no handoff agente)
- `npm run build:api`
- `npm run build:widget`

## Resultado de validacoes

- `build:api` OK
- `build:widget` OK

## Pendencias para retomada

- Commit/push e redeploy API + widget.
- Smoke: assumir atendimento, abrir painel, editar nome/WhatsApp/observacoes, anexar arquivo, ver variaveis Typebot, transferir atendente.
