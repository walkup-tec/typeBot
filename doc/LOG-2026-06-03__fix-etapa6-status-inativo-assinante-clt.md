# LOG — Etapa 6: status Inativo no assinante vs Ativo no master

**Data:** 2026-06-03

## Problema

Fluxo CLT (padrão) **Ativo** na Biblioteca Master Walkup, **Inativo** na etapa 6 do assinante.

## Causa

- API `attachFlowActiveStatus` (fast): sem match no workspace (URL/publicId da matriz).
- Admin: `healthStatus` = Inativo quando não havia `linkedFlow` ou flags da API negativas.

## Alterações

- `apps/api/src/lib/typebot-flow-publish-status.ts` — `enrichFlowActiveStatusAfterIndex`
- `apps/admin/src/App.tsx` — vínculo por catálogo + fallback matriz para padrões

## Deploy

Redeploy **api** + **painel**; no assinante: Atualizar lista (etapa 6).
