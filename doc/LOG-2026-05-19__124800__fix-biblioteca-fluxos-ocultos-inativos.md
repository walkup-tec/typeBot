# Biblioteca de fluxos vazia — Drax Sistemas

## Sintoma

Etapa 6 mostra "Nenhum fluxo disponível" para assinante Drax Sistemas.

## Causa

1. UI filtrava só fluxos com status **Ativo** (`visibleLibraryFlowRows` / `activeWorkspaceOnlyFlows`).
2. URLs salvas apontam para hosts antigos (`soma-typebot-walkup-viewer`, `typebot-walkup-viewer`) ou viewer retorna **500**.
3. Fluxo "Drax Sistemas" costuma estar em **Fluxos do workspace**, não no catálogo padrão da Biblioteca Master.

## Correção código

- `apps/admin/src/App.tsx`: exibir fluxos **inativos** também (status Inativo visível).
- `apps/api/src/lib/flow-url-health.ts`: fallback para `TYPEBOT_TARGET_VIEWER_BASE_URL` e migração `typebot-walkup-viewer` → `typebot-typebot-walkup-viewer`.

## Ops (produção)

API `api-typebot-crm`:

```env
TYPEBOT_TARGET_VIEWER_BASE_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
TYPEBOT_BUILDER_API_BASE_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api
```

Viewer: `PORT=3000`, `HOSTNAME=0.0.0.0` → redeploy.

Painel: redeploy após merge. Abrir etapa 6 → F5 → API auto-corrige URLs ao listar fluxos.

## Biblioteca Master

Para auto-incluir na seção "Fluxos ativos na biblioteca": marcar fluxo como **padrão** na Biblioteca Master (conta walkup matriz).
