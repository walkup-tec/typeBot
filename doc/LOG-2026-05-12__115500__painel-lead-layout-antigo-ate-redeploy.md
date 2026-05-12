# Snapshot - painel lead ainda com layout antigo em producao

Data: 2026-05-12

## Solicitacao aberta

- Usuario reportou que o painel de contato continua com layout antigo (cards estaticos, secao "Dados do contato", lapis na toolbar).

## Causa

- Alteracoes de edicao inline estavam apenas no working tree local; ultimo commit publicado era `b130cb3`.
- Producao servia build antigo da API (`handoff-view`) e/ou widget/admin sem o novo bundle.

## Acao nesta sessao

- Commit e push `1807c3b` com edicao inline no widget, handoff (`queue.routes.ts`) e modal admin.
- Builds locais: `build:api`, `build:widget`, `build:admin` OK.

## Pendencias

- Redeploy dos tres servicos no Easypanel no commit `1807c3b`.
- Hard refresh ou aba anonima ao validar.
- Testar blur/Enter salva, copiar e CPF vazio.
