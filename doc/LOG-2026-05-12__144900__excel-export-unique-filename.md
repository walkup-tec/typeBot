# Snapshot — nome único no export Excel

**Data:** 2026-05-12

## Pedido

- ID único em cada ficheiro Excel exportado para evitar sobrescrever downloads.

## Alteração

- `apps/admin/src/exportClientDirectoryExcel.ts` — `createClientDirectoryExportFileName` com `crypto.randomUUID()`.

## Validação

- `npm run build:admin` — OK.

## Pendência

- Commit/push e redeploy do painel.
