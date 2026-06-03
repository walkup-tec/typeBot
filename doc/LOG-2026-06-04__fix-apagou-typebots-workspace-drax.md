# Fix — sync apagava typebots do workspace do assinante (Drax vazio)

## Sintoma

- Ontem fluxo publicado (`drax-sistemas-d3hpop9`); hoje workspace **Drax Sistemas** vazio no builder.
- Viewer 404: bot não existe mais no Postgres.

## Causa raiz

`syncSystemDefaultsToRealTypebotWorkspace(..., { overwriteExisting: true })` chamava `pruneNonDefaultTypebotsOnTarget` em modo estrito e **deletava via API** todo typebot cujo nome não fosse padrão da Biblioteca Master (ex.: Campanha, Drax Sistemas).

Disparadores recentes: `propagateDefaultsToSubscriberWorkspacesInBackground` após promote, `sync-defaults`, patch de logo do tenant.

## Correção

- `pruneNonDefaultTypebotsOnTarget` → no-op (não apaga bots do workspace).
- `pruneTenantLocalLibraryFlows` em strict → não remove registros locais por nome.
- `sync-workspace` / `sync-workspace-flows` → reimporta padrões antes do import manual.

## Marker

`DEPLOY-2026-06-04-walkup-fix-nao-apagar-fluxos-workspace`

## Recuperação (ops)

1. Redeploy API.
2. Master → Drax → **Atualizar lista** (reimporta padrão CLT se configurado na matriz).
3. Recriar no builder o bot que foi apagado (slug novo); publicar; **Atualizar lista** de novo.

Não há restore automático do typebot apagado sem backup do Postgres.
