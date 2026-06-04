# LOG 2026-06-04 — dedupe fluxos tenant (biblioteca + workspace)

## Contexto

- Chat: lista duplicada Soma vs 1 bot no Typebot após **Atualizar lista**.
- Tenant Soma: `1f992ff8-741b-451d-b3c8-bb08ec1ba92a`.

## Alterações

- `apps/api/src/typebot/typebot-flow-viewer-url-sync.ts` — dedupe unificado, import por título, align múltiplos registros.
- `apps/admin/src/App.tsx` — Etapa 6 não lista workspace duplicado do mesmo `typebotRemoteId` da biblioteca.
- `apps/api/src/deploy-marker.ts` — `DEPLOY-2026-06-04-tenant-flow-dedupe-by-remote-id`.

## Validação

- Linter: OK nos arquivos editados.
- Produção: ainda precisa redeploy + **Atualizar lista** no assinante.

## Pendências

1. Redeploy serviço `api` no Easypanel.
2. Painel Master → Soma → Etapa 6 → **Atualizar lista**.
3. Opcional: recopiar da matriz após purge (rota purge ainda depende de deploy anterior).
