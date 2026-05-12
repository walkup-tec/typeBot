# Snapshot — nome Drax Sistemas nas telas

**Data:** 2026-05-12

## Solicitações abertas

- Redeploy painel/API/widget com commits atuais.
- Validar login walkup após envs de recuperação do master.
- Confirmar em produção: export Excel, coluna Ações centralizada e nome **Drax Sistemas** no ambiente Drax.

## Alterações

- Mapa canônico do atendente Drax (`draxsistemas@gmail.com`, `draxsistemas`, `darsistemas` → Drax Sistemas).
- `resolveAttendantDisplayName` atualizado na API, painel e widget.
- Lista de clientes, modal do lead, sessão do usuário no painel, lista de atendentes e login da API passam a usar o rótulo humano.
- Handoff (`queue.routes.ts`): mesma regra no script inline.

## Arquivos

- `apps/api/src/lib/known-attendant-display-name.ts`
- `apps/api/src/lib/agent-session-meta.ts`
- `apps/api/src/auth/auth.routes.ts`
- `apps/api/src/queue/queue.routes.ts`
- `apps/admin/src/knownAttendantDisplayName.ts`
- `apps/admin/src/resolveAttendantDisplayName.ts`
- `apps/admin/src/clientDirectory.ts`
- `apps/admin/src/LeadDetailModal.tsx`
- `apps/admin/src/App.tsx`
- `apps/widget/src/knownAttendantDisplayName.ts`
- `apps/widget/src/resolveAttendantDisplayName.ts`
- `doc/memoria.md`

## Comandos

- `npm run build:api`
- `npm run build:admin`
- `npm run build:widget`

## Validação

- Builds API, admin e widget: OK.
- Linter nos arquivos alterados: sem erros.

## Pendências

- Commit/push e redeploy dos três apps.
- Smoke manual no tenant Drax (menu, fila, clientes, lead, widget/handoff).
