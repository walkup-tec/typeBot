# LOG 2026-05-26 11:49 — Lista de clientes: Telefone (copiar) + full width

## Solicitações abertas no momento
- Adicionar coluna **Telefone** com opção de **copiar**.
- Ajustar distribuição/largura das colunas para **ocupar a tela inteira**.

## Alterações realizadas
- Tabela de clientes:
  - Nova coluna **Telefone** (renderiza `row.whatsapp`) com botão de copiar (usa `copyTextToClipboard`).
  - Placeholder de busca atualizado para incluir Telefone.
- Export Excel:
  - Inclui coluna **Telefone** entre CPF e Fluxo/Produto.
- Layout/estilos:
  - `.clients-table` agora usa `width: 100%` e `table-layout: fixed` para preencher a tela.
  - Larguras fixas para colunas `Telefone`, `Etiquetas` e `Ações` (Ações continua por último).

## Arquivos alterados
- `apps/admin/src/ClientsListScreen.tsx`
- `apps/admin/src/exportClientDirectoryExcel.ts`
- `apps/admin/src/styles.css`
- `doc/memoria.md`
- `doc/LOG-2026-05-26__114900__clients-telefone-e-fullwidth.md`

## Comandos executados (local)
- `git status --short`
- `git diff --stat`
- `git log -3 --oneline`

## Validações
- Linter: sem erros nos arquivos tocados.

## Pendências para retomada
- Criar commit/push quando solicitado.
- Rebuild do **painel-typebot-crm** após o push e Ctrl+F5.

