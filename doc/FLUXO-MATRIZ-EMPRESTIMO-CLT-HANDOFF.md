# Fluxo matriz — Empréstimo CLT (`emprestimo-clt`)

Viewer: https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/emprestimo-clt

Objetivo: ao final do fluxo, abrir **https://app.chattypebot.com/handoff-view** (tela de atendimento / fila).

## Valores fixos (matriz Walkup)

| Variável | Valor |
|----------|--------|
| `tenantId` | `07d245ea-48b9-4eda-a4a0-b8be573eb4bf` |
| `sourceFlowLabel` | `emprestimo-clt` |
| `viewer_url` / `typebotViewerUrl` | `https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/emprestimo-clt` |

Use **Text** nos blocos Set variable (não `tenant.id` literal).

## Blocos no Typebot (ordem sugerida)

1. **Set variable** — `tenantId`, `sourceFlowLabel`, `viewer_url` (placeholders; a API pode corrigir no repair).
2. **HTTP Request** (POST)  
   - URL: `https://app.chattypebot.com/api/typebot/handoff`  
   - Body JSON (exemplo):

```json
{
  "contactName": "{{Nome}}",
  "source": "typebot",
  "tenantId": "{{tenantId}}",
  "sourceFlowLabel": "{{sourceFlowLabel}}",
  "typebotViewerUrl": "{{viewer_url}}"
}
```

3. Mapear resposta → variável **`url_direct`** (bodyPath: `url_direct`).
4. **Redirect** → URL: **`{{url_direct}}`** (nunca URL MinIO / imagem).

## Reparo automático (API)

Após redeploy da API:

```http
POST https://app.chattypebot.com/api/master/system-library/repair-matrix-handoff
Content-Type: application/json

{"publicId":"emprestimo-clt"}
```

Isso patcha webhook + redirect no builder **fonte**, publica o fluxo e alinha `saved-flows` / biblioteca master.

Marker: `DEPLOY-2026-06-04-matrix-clt-handoff-emprestimo`

## Teste rápido (sem Typebot)

```bash
node -e "fetch('https://app.chattypebot.com/api/typebot/handoff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contactName:'Teste',source:'typebot',sourceFlowLabel:'emprestimo-clt',typebotViewerUrl:'https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/emprestimo-clt'})}).then(r=>r.json()).then(j=>console.log(j.url_direct))"
```

Deve imprimir URL `.../handoff-view?tenantId=07d245ea-...` (Walkup), não outro assinante.

## Checklist manual no builder

- [ ] Fluxo publicado com slug **emprestimo-clt**
- [ ] Webhook aponta para `app.chattypebot.com/api/typebot/handoff`
- [ ] Redirect = `{{url_direct}}`
- [ ] Teste no viewer até abrir handoff-view
