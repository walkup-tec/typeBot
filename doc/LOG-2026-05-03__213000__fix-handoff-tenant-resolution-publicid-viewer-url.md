# Contexto do pedido

O utilizador configurou modulos de redirecionamento no fluxo Typebot (handoff para fila / URL do viewer) e o comportamento esperado nao ocorria.

# Diagnostico

O endpoint `POST /api/typebot/handoff` identificava o tenant apenas quando:

- `sourceFlowLabel` era **igual** ao `nickname` do fluxo no painel, ou
- a URL do fluxo continha a substring `/${sourceFlowLabel}`.

Na pratica o Typebot envia com frequencia o **publicId** do viewer (ultimo segmento do path, ex. `drax-sistemas-px5k4a3`) ou um texto diferente do apelido tecnico guardado no SaaS. Nesses casos o matching falhava, devolvia **400** e o Redirect nao recebia URL.

# Solucao implementada

1. Funcao `savedFlowMatchesHandoffSource` em `queue.routes.ts` que considera:
   - `nickname`, `displayLabel`
   - `typebotPublicId` persistido e `typebotPublicIdFromViewerUrl(saved.url)`
   - `url` contendo `/${token}` para o label normalizado
   - opcionalmente o publicId extraido de **`typebotViewerUrl`** no body do webhook (quando enviado)

2. Lista de fluxos candidatos **deduplicada** por `SavedFlow.id`.

3. Mensagem de erro 400 atualizada para indicar `tenantId`, alinhamento de `sourceFlowLabel` com publicId/apelido ou uso de `typebotViewerUrl`.

# Arquivos alterados

- `apps/api/src/queue/queue.routes.ts`
- `doc/memoria.md`
- `doc/LOG-2026-05-03__213000__fix-handoff-tenant-resolution-publicid-viewer-url.md`

# Como validar

1. `POST /api/typebot/handoff` com `tenantId` valido, `contactName`, `sourceFlowLabel` igual ao **publicId** da URL publicada do Typebot (sem o tenant coincidir apenas por nickname antigo).
2. Opcional: mesmo pedido com `sourceFlowLabel` generico mas `typebotViewerUrl` apontando para o viewer publicado — deve resolver o mesmo fluxo.
3. Confirmar **201** e campos `handoffUrl`, `urlFlat`, `data.urlFlat` para mapear no bloco Redirect/Webhook.

# Observacoes de seguranca

- Nao foram expostos segredos; apenas heuristica de correspondencia de fluxos ja persistidos.

# Outras causas comuns de Redirect “nao funcionar”

- URL publica `TYPEBOT_HANDOFF_WEBHOOK_URL` inacessivel pelo Typebot (tunnel/firewall).
- Bloco **Webhook** sem corpo com `tenantId` correto (re-sync / patch do builder).
- Mapeamento da variavel no Typebot apontando para path errado — usar `data.urlFlat` ou `urlFlat` na raiz conforme picker.
- Fluxo nao **publicado** apos alteracoes.

# Palavras-chave

- `typebot-handoff-tenant-resolution`
- `redirect-typebot-publicId`
- `sourceFlowLabel`
