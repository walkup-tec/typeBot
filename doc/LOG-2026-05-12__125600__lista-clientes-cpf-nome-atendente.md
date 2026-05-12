# Snapshot - lista clientes CPF nome atendente

Data: 2026-05-12

## Solicitacao

- Lead com CPF registrado deve aparecer na lista.
- Nome igual a Nome_Contato: listar apenas Nome.
- Coluna Atendente com nome humano, nao e-mail.

## Arquivos alterados

- `apps/admin/src/clientDirectory.ts`
- `apps/admin/src/resolveAttendantDisplayName.ts` (novo)
- `apps/admin/src/App.tsx`
- `doc/memoria.md`

## Validacao

- `npm run build:admin` OK.

## Pendencias

- Commit/push e redeploy admin.
