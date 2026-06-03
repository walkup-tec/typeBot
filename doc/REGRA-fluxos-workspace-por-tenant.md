# Regra: fluxos do workspace Typebot por assinante

## Regra de negócio

Quando o assinante **XPTO** cria um fluxo no **workspace Typebot do XPTO**, esse fluxo deve:

1. Aparecer no painel Drax **somente** no cadastro do assinante XPTO (etapa 6 / listagem de fluxos).
2. **Nunca** aparecer para outro assinante (YPTO, Drax, etc.).
3. Ser persistido com `tenantId` do XPTO em `saved-flows.json` (volume da API).

Fluxos com `librarySourceId` são cópias do catálogo Biblioteca Master **naquele** tenant (padrão compartilhado da matriz, instância local).

Fluxos **sem** `librarySourceId` são exclusivos do workspace daquele tenant (criados no builder Typebot do assinante).

## Implementação (código)

| Peça | Arquivo |
|------|---------|
| Regra + sync | `apps/api/src/flows/tenant-workspace-flows.service.ts` |
| Import builder → disco | `importManualWorkspaceTypebotsIntoTenantFlows` em `typebot-flow-viewer-url-sync.ts` |
| Filtro listagem | `filterTenantFlowsForWorkspace` — sem `librarySourceId` só se está no catálogo do workspace **do tenant** |
| Listagem master | `GET /api/master/tenants/:tenantId/flows` → `listSubscriberTenantFlowsForMaster` |
| UI etapa 6 | `tenantWorkspaceFlowsForStep6` = fluxos sem `librarySourceId` |

## Proibido (causa perda de bots)

- **Nunca** apagar typebots do workspace do assinante via sync/promote (`pruneNonDefaultTypebotsOnTarget` desativado).
- Remoção remota só ao desmarcar padrão na Biblioteca Master (`removeSystemDefaultFromSubscriberWorkspaces`).

## Operação

- Provisionar workspace: `typebotWorkspaceId` no tenant.
- **Atualizar lista** no master: `sync-workspace` + `flows?sync=1`.
- Token: `TYPEBOT_TARGET_BUILDER_API_TOKEN` com acesso ao workspace do assinante.

## Marker deploy

`DEPLOY-2026-06-04-walkup-regra-workspace-por-tenant`
