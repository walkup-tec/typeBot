# Snapshot — commit e push caf5618

**Data:** 2026-05-12

## Contexto

- Deploy da API no Easypanel concluiu com commit `21e9687` (somente docs walkup).
- Alteracoes de lista global de clientes e nome Drax estavam apenas no working tree.

## Commit

- Hash: `caf5618`
- Mensagem: `feat(api,admin): lista global de clientes e nome Drax Sistemas`
- Push: `origin/master` (`21e9687..caf5618`)

## Arquivos no commit

- API: `known-attendant-display-name.ts`, `agent-session-meta.ts`, `auth.routes.ts`, `queue.*`
- Admin: `App.tsx`, `ClientsListScreen.tsx`, `clientDirectory.ts`, `LeadDetailModal.tsx`, export Excel, `knownAttendantDisplayName.ts`, `resolveAttendantDisplayName.ts`
- Widget: `knownAttendantDisplayName.ts`, `resolveAttendantDisplayName.ts`
- Docs: `memoria.md`, logs 153000/153500/154500

## Comandos

- `git add` (paths acima)
- `git commit`
- `git push origin master`

## Pendencias

- Redeploy **painel-typebot-crm** (obrigatorio para UI).
- Redeploy **api-typebot-crm** no commit `caf5618`.
- Hard refresh e validar menu Lista de Clientes no master walkup.
