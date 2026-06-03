# Deploy — Biblioteca Master

Checklist único após alterações em `source-master-sync.service.ts` ou tela Biblioteca Master.

## Easypanel

| Ordem | Serviço | Build |
|------|---------|--------|
| 1 | **`api`** | `npm ci && npm run build:api` |
| 2 | **painel** | `npm ci && npm run build:admin` |

Variáveis obrigatórias no serviço **`api`**:

- `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID` — workspace Walkup no builder
- `TYPEBOT_SOURCE_VIEWER_BASE_URL` — ex. `https://typebot-typebot-walkup-viewer.achpyp.easypanel.host`
- `TYPEBOT_SOURCE_BUILDER_API_TOKEN`

## Validar (obrigatório)

```powershell
.\scripts\smoke-biblioteca-master.ps1
```

Ou manualmente:

- `GET https://app.chattypebot.com/health` → `deployMarker` = `DEPLOY-2026-06-03-api-biblioteca-walkup-only` e `masterLibraryLogicVersion` = `walkup-live-only-v2`
- `GET .../api/master/system-library/source-flows` → **0 ou 1** fluxo; **nunca** URLs `soma-typebot`
- Painel → Biblioteca Master → **Atualizar lista**

## Comportamento esperado

- Só fluxos **Live** do workspace matriz Walkup (`walkup@walkuptec.com.br`)
- Sem fallback de fluxos de outros assinantes
- Toast verde em "Lista atualizada"
