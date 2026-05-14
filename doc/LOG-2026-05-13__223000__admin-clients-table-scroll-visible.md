# Snapshot — Lista de Clientes scroll visível

## Pedido

- Barra de rolagem horizontal da tabela só aparecia no fim da página vertical.

## Alteração

- `apps/admin/src/styles.css`: `.clients-table-wrap` com `max-height: calc(100dvh - 240px)`, `overflow: auto`, borda; `thead th` sticky com fundo semitransparente.

## Deploy

- Rebuild painel admin.
