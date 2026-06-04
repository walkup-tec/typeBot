# Recuperação fluxos workspace Drax (vestígios)

## Problema

Workspace Drax vazio; URL `drax-sistemas-d3hpop9` → 404. Causa anterior: prune deletou bots no Typebot.

## Vestígios usados

- `saved-flows` do tenant `3fd073ba-7a9a-482c-9714-bbf6f1ed4e8b`
- `typebotRemoteId` `cmopzmivk0025ru1czpx5k4a3`, publicIds `d3hpop9` / `px5k4a3`
- Varredura de **todos** workspaces na Builder API

## Código

- `apps/api/src/typebot/recover-tenant-workspace-typebots.service.ts`
- `POST /api/master/tenants/:id/typebot/recover-workspace-flows`
- `Atualizar lista` → chama recover antes do sync

## Ops

1. Redeploy API marker `walkup-recupera-fluxos-drax-vestigios`
2. Painel Drax → **Atualizar lista**
3. Se `recovery.notFound` ainda listar Drax: schema apagado do Postgres → backup DB ou script `import-typebot-fluxo-para-drax.ps1` com token

## Script manual

`scripts/import-typebot-fluxo-para-drax.ps1` — tenant UUID correto, publicId `d3hpop9`
