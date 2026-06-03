# LOG 2026-06-03 — DEPLOY walkup-correcoes-completas

## Commit
`DEPLOY-2026-06-03-walkup-correcoes-completas`

## Inclui (histórico recente no master + este pacote)
- API: promote Biblioteca Master (hints/upsert), fluxo padrão nos assinantes (`subscriber-default-flows`)
- Painel: remover compartilhado atualiza lista; `publicApiBase.ts`; API base `app.chattypebot.com`
- Limpeza: remove `api.chattypebot.com` / rota legada; sales normaliza API; docs Easypanel

## Markers pós-deploy
| Serviço | Validar |
|---------|---------|
| **api** | `GET https://app.chattypebot.com/health` → `DEPLOY-2026-06-03-walkup-correcoes-completas` |
| **painel** | bundle com `ADMIN_BUILD_MARKER` igual (devtools / build) |

## Redeploy (ordem)
1. **api** — volume fluxos/fila preservado
2. **painel**
3. **paginadevendas** (opcional, se LP usa sales)

## Teste rápido
- Master: Biblioteca Master → Atualizar lista; fluxo padrão CLT em compartilhados
- Assinante Drax: Etapa 6 → Atualizar lista → fluxo padrão + workspace
- Remover compartilhado → volta à lista superior sem F5

## Não incluído no commit
- `Asaas.txt`, backups/, agent-tools/, logos locais
- Logs históricos `doc/LOG-2026-04-*` (apenas referência)
