# Snapshot - edicao inline contato topo painel lead

Data: 2026-05-12

## Chats / solicitacoes abertas

- Edicao inline de Nome, WhatsApp e CPF no topo do painel do lead (sem secao inferior de edicao).
- Contexto anterior: CPF no lead, deploy producao, persistencia de sessao.

## Arquivos alterados

- `apps/widget/src/LeadInlineFactField.tsx` (novo)
- `apps/widget/src/LeadDrawerPanel.tsx`
- `apps/widget/src/WidgetApp.tsx`
- `apps/widget/src/widget.css`
- `apps/api/src/queue/queue.routes.ts`
- `doc/memoria.md`

## Comandos executados

- `npm run build:api` — sucesso (exit 0)

## Validacoes

- Linter: sem erros em `WidgetApp.tsx` e `queue.routes.ts`
- Build admin/widget: nao executado nesta sessao (vite fora do PATH local)

## Pendencias

- Commit/push das mudancas locais
- Redeploy `api-typebot-crm` e `widget-typebot-crm`
- Teste manual: editar com lapis, salvar no blur/Enter, copiar, CPF vazio e preenchido pelo Typebot
- Avaliar se o nome no card de perfil deve ser o unico campo de nome (hoje tambem ha linha "Nome do lead" na lista)
