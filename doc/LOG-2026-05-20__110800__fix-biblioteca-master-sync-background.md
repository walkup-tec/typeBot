# LOG 2026-05-20 — Biblioteca Master vazia + sem botão

## Contexto
- Painel produção (`painel.chattypebot.com`): Biblioteca Master vazia, mensagem antiga "Nenhum fluxo encontrado para a conta master de origem", **sem** botões Atualizar/Sincronizar.
- Código local já tinha botões; produção = build antigo do painel.

## Causa raiz (API)
- `GET /api/master/system-library/source-flows` fazia `await syncSourceWorkspaceFlowsToMasterTenant()` antes de responder.
- Fetch ao builder Typebot **sem timeout** → requisição pendurada (curl >75s).
- Painel abortava ou recebia lista vazia; com viewer 500, versão antiga da API filtrava só URLs ativas.

## Alterações
- `flow.routes.ts`: sync da matriz em **background** no GET; novo `POST /api/master/system-library/sync-source`.
- `source-master-sync.service.ts`: `fetchWithTimeout` 12s nas chamadas ao builder.
- `App.tsx`: botões **Sincronizar do Typebot** + **Atualizar lista da matriz**; timeout fetch 30s/45s; mensagens de status.

## Deploy necessário
1. **api-typebot-crm** — rebuild com estes arquivos.
2. **painel-typebot-crm** — rebuild admin (`VITE_API_BASE_URL` correto).
3. Easypanel API: `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`, tokens builder, viewer URLs.
4. Corrigir **viewer HTTP 500** (`PORT=3000`, `HOSTNAME=0.0.0.0`).

## Validação
- `GET .../source-flows` deve responder em <30s mesmo com Typebot lento.
- `POST .../sync-source` importa fluxos do workspace matriz.
- Biblioteca Master mostra fluxos **Inativo** se viewer 500.

## Pendências
- Redeploy produção (usuário).
- Rotacionar token Typebot exposto em chat anterior.
