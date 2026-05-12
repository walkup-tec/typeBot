# Snapshot - CPF na lista de clientes admin

Data: 2026-05-12

## Solicitacao

- Lead com CPF registrado nao aparecia na lista de clientes.

## Causa

- `clientDirectory.ts` tratava chaves de CPF como reservadas e nao montava coluna dedicada.

## Arquivos alterados

- `apps/admin/src/clientDirectory.ts`
- `apps/admin/src/ClientsListScreen.tsx`
- `doc/memoria.md`

## Validacao

- `npm run build:admin` OK.

## Pendencias

- Commit/push e redeploy do admin.
