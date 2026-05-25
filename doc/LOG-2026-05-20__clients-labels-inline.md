# LOG 2026-05-20 — Lista de clientes: etiquetas inline

## Solicitação
Exibir inline as etiquetas atribuídas a cada lead na Lista de Clientes.

## Arquivos alterados
- `apps/admin/src/clientDirectory.ts` — tipos label, `resolveClientLeadLabels`, `leadLabels` na row, busca
- `apps/admin/src/ClientsListScreen.tsx` — `LabelTag` na célula Nome
- `apps/admin/src/exportClientDirectoryExcel.ts` — coluna Etiquetas
- `apps/admin/src/styles.css` — estilos célula nome + tags
- `doc/memoria.md`

## Validação
- Linter admin: sem erros nos arquivos tocados.
- API: labels já vêm de `withNormalizedQueueContact` em `queueService.listAll` / list por tenant.

## Pendências
- Commit/push se o usuário pedir.
- Rebuild painel Easypanel; Ctrl+F5; conferir `data-build="20260520-clients-labels-v4"`.
