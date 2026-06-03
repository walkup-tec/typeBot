# API 502 — domínio Easypanel (destino automático com `_`)

> Serviço atual: **`api`** (`app.chattypebot.com`). O antigo **`api-typebot-crm`** foi descontinuado.

## Sintoma

- `curl http://localhost:3333/health` dentro do contentor → **200**
- `https://app.chattypebot.com/health` → **502 Bad Gateway**
- Na aba **Domínios**, o destino aparece como `http://typebot_api:3333/` (ou variante com `_`) e **não há campo para editar** — comportamento normal do Easypanel.

## O que importa (teste interno)

| Host interno | Resultado esperado |
|--------------|-------------------|
| `typebot_api:3333` | **200** (nome gerado pelo Swarm) |
| `api:3333` | **200** (nome curto do serviço) |

Não tente “corrigir” o destino na UI — ele é só leitura.

## Checklist no serviço da API (antes de renomear)

1. **Ambiente** (uma linha por chave):
   ```env
   NODE_ENV=production
   PORT=3333
   HOST=0.0.0.0
   ```
2. **Configurações / porta HTTP do app** (engrenagem): **3333** (igual ao `PORT`).
3. **Logs** após deploy: `API running on http://0.0.0.0:3333` (commit `7117ab0`+).
4. **Domínios** — Host público correto:
   - `app.chattypebot.com`
   - `typebot-api-typebot-crm.achpyp.easypanel.host`
   - Remover `https://api-typebot-crm/` (não é URL pública válida).
5. Procurar `app.chattypebot.com` em **todos** os serviços do projeto — deve existir **só** na API.

## Correção quando o destino automático não conecta (sem editar destino)

### Opção A — Renomear o serviço (recomendado)

1. No projeto **typebot**, garantir serviço **`api`** com Git/build/start/env/volumes corretos (ver `doc/EASYPANEL-PARIDADE-SERVICO-API.md`).
2. Nome do serviço: **`api`** (curto).
3. Destino automático passa a ser algo como `http://typebot_api:3333/`.
4. Mover os domínios para o serviço **`api`**.
5. No **Console** do novo serviço:
   ```bash
   curl -sS -i http://typebot_api:3333/health
   curl -sS -i http://api:3333/health
   ```
   Pelo menos um deve dar **200** antes de testar o domínio público.
6. **Implantar** → remover serviços duplicados/antigos só depois de validar `/health`.

### Opção B — Manter o nome e validar deploy

Se `curl http://typebot_api-typebot-crm:3333/health` passar a dar **200** após `HOST=0.0.0.0` e porta 3333 na engrenagem, **não precisa renomear** — só **Reimplantar**.

## Teste final (PowerShell)

```powershell
Invoke-RestMethod "https://typebot-api.achpyp.easypanel.host/health"
Invoke-RestMethod "https://app.chattypebot.com/health"
```

Esperado: JSON com `"status":"ok"`.
