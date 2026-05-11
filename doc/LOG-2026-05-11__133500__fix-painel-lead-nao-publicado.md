# Snapshot - painel lead nao aparecia em producao

## Chats / solicitacoes abertas

- Usuario reportou que o icone/painel de dados do lead nao apareceu no chat do atendente.

## Causa raiz

- Implementacao do drawer e APIs estava apenas local (arquivos modificados sem commit/push).
- Producao continuava no commit anterior (`003d5d6`).

## Arquivos alterados

- `apps/api/src/queue/queue.routes.ts` (flex-shrink no botao do lead)
- `apps/widget/src/widget.css` (override de estilos globais de `button` no drawer)
- `doc/memoria.md`
- commit/push: `c211d99`

## Comandos executados

- `npm run build:api`
- `npm run build:widget`
- `git commit` + `git push origin master`

## Resultado de validacoes

- builds API e widget OK
- push para `origin/master` OK

## Pendencias para retomada

- Redeploy da API (handoff-view) e do widget se o admin usar `VITE_WIDGET_BASE_URL`.
- Hard refresh na aba do atendente apos deploy.
- Smoke: icone ao lado do nome, abrir drawer, salvar perfil e anexos.
