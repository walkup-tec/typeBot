# LOG 2026-05-20 — fix chat iframe Fila ao vivo + lead

## Solicitação
Chat de atendimento não carrega no painel (atendente) nem para o Lead.

## Causa raiz (painel)
- `LiveInboxScreen` usa `<iframe src={chatUrl}>`.
- `chatUrl` vinha de `VITE_WIDGET_BASE_URL` (widget) ou `apiBase/handoff-view`.
- API aplicava `X-Frame-Options: SAMEORIGIN` em todas as rotas → browser bloqueia iframe de `painel.chattypebot.com` → `app.chattypebot.com`.
- `widget.chattypebot.com` pode estar sem DNS (curl falhou).

## Alterações
- `apps/api/src/server.ts`: `/handoff-view` sem `X-Frame-Options`; CSP `frame-ancestors` + env `FRAME_ANCESTORS`.
- `apps/admin/src/App.tsx`: Fila ao vivo sempre `buildHandoffAgentViewUrl`; nova aba `getAgentViewUrlNewTab` (widget opcional); fallback painel → `https://app.chattypebot.com`.
- `apps/widget/public/_headers`: frame-ancestors se widget for publicado em host estático.
- `doc/DEPLOY-VPS-chattypebot-com.md`: env `FRAME_ANCESTORS`.

## Deploy
1. **api-typebot-crm** (headers + handoff GET se ainda não)
2. **painel-typebot-crm** (URL embed)

## Teste pós-deploy
1. Fila ao vivo → selecionar Marcelo → chat renderiza (não ícone quebrado).
2. Lead: abrir `handoffUrl` após fluxo Typebot → tela de espera ou chat ao vivo.
3. `curl -sI https://app.chattypebot.com/handoff-view?mode=agent&tenantId=x&contactId=y` → sem `X-Frame-Options: SAMEORIGIN`; CSP com `frame-ancestors`.
