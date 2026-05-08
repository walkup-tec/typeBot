# Snapshot — Watcher auto-import Typebot (5-8s)

## Chats e solicitacoes abertas

- Usuario pediu implantacao de rotina automatica com intervalo entre 5 e 8 segundos para detectar novos fluxos criados no Typebot.

## Arquivos alterados

- `apps/api/src/server.ts`
- `doc/memoria.md`
- `doc/LOG-2026-05-08__075707__watcher-auto-import-typebot-5a8s.md`

## Comandos executados

- `npm run build:api`
- `ReadLints` em `apps/api/src/server.ts`
- `Get-Date -Format 'yyyy-MM-dd__HHmmss'`

## Resultado de validacoes

- Build API: sucesso.
- Linter: sem erros no arquivo alterado.

## Pendencias para retomada

1. Commit e push dessa alteracao para `master`.
2. Deploy da API no Easypanel.
3. Verificar log de runtime: `[typebot-tenant-flow-sync] enabled intervalMs=...`.
4. Publicar novo fluxo no Typebot do tenant e confirmar entrada automatica na biblioteca.

