# Typebot SaaS (Base Local)

Base inicial para transformar o ambiente Typebot em SaaS com:

- painel master para gerenciar assinantes;
- isolamento multi-tenant (`tenant_id`);
- fila de atendimento com atribuição de atendente;
- infraestrutura local padrão (Postgres, Redis e MinIO).

## Stack inicial

- `apps/api`: Node.js + Express + TypeScript (controller/service/repository)
- `apps/admin`: React + Vite (painel master + assinantes + fila)
- `apps/widget`: React + Vite (template de chat com handoff humano)
- `docker-compose`: Postgres, Redis, MinIO

## Como subir local

1. Instale dependências:

```bash
npm install
```

2. Suba infraestrutura local:

```bash
docker compose up -d
```

3. Rode a API:

```bash
npm run dev:api
```

4. Rode o painel admin:

```bash
npm run dev:admin
```

5. Rode o widget de chat:

```bash
npm run dev:widget
```

### Configurar integração com Typebot no widget

Crie `apps/widget/.env.local` com base em `apps/widget/.env.example`.

Exemplo:

```bash
VITE_API_BASE_URL=http://localhost:3333
VITE_TENANT_ID=demo-tenant
VITE_TYPEBOT_PUBLIC_URL=https://soma-typebot-walkup-viewer.achpyp.easypanel.host/fluxo-teste-8mewtqh
```

`VITE_TYPEBOT_PUBLIC_URL` deve ser o link público do bot no seu viewer Typebot.

6. Healthcheck:

```bash
curl http://localhost:3333/health
```

### Importante: redirecionamento do visitante (handoff)

Para quem interage no Typebot hospedado externamente, **não use `localhost`** no redirect.

- `localhost` funciona apenas no mesmo computador do atendente.
- Para o visitante, use URL pública do widget (ex.: túnel/ngrok).

Defina no backend:

```bash
WIDGET_BASE_URL=https://SEU-WIDGET-PUBLICO
```

Assim o endpoint `/api/typebot/handoff` devolve `handoffUrl` público válido.

## Interfaces locais

- Admin: `http://localhost:5173`
- Widget: `http://localhost:5174`
- API: `http://localhost:3333`

## Endpoints iniciais

### Master (assinantes / tenants)

- `POST /api/master/tenants`
- `GET /api/master/tenants`
- `PATCH /api/master/tenants/:id/status` (`active` | `blocked`)

### Fila de atendimento (tenant-aware)

Todos exigem header `x-tenant-id`.

- `POST /api/chat/queue` -> entra na fila
- `GET /api/chat/queue` -> lista fila do tenant
- `PATCH /api/chat/queue/:contactId/assign` -> atribui contato ao atendente e remove da fila comum
- `POST /api/typebot/handoff` -> entrada automática na fila a partir de um botão/HTTP Request no Typebot
- `GET /api/chat/sessions/:contactId/messages` -> histórico da sessão ao vivo
- `POST /api/chat/sessions/:contactId/messages` -> mensagem manual do atendente/visitante

## Integração com Typebot (botão "Falar com Atendente")

No fluxo Typebot, adicione um bloco `HTTP Request` após o botão "Falar com Atendente":

- Método: `POST`
- URL: `http://localhost:3333/api/typebot/handoff` (ou URL pública da sua API)
- Header: `content-type: application/json`
- Body (JSON):

```json
{
  "contactName": "{{nome_completo}}",
  "source": "typebot",
  "sourceFlowLabel": "clt-soma",
  "initialMessage": "Cliente solicitou falar com atendente",
  "typebotViewerUrl": "https://SEU-VIEWER-PUBLICO/SEU-CAMINHO-DO-FLUXO",
  "leadContext": {
    "nome": "{{nome_completo}}",
    "telefone": "{{telefone}}",
    "data_nascimento": "{{data_nascimento}}"
  }
}
```

O campo `leadContext` é opcional e serve para mostrar no topo do chat os dados que o lead já informou no fluxo, mantendo sensação de continuidade.

`tenantId` agora é opcional no handoff:

- se for enviado, a API usa o valor informado;
- se não for enviado, a API identifica automaticamente pelo `sourceFlowLabel` com base nos fluxos cadastrados no painel (`nickname` ou URL contendo o slug).

Depois, no painel admin (`localhost:5173`), o atendente clica em `Assumir atendimento` e o sistema abre:

- `http://localhost:5174/?mode=agent&tenantId=...&contactId=...&agentId=...`

O endpoint `POST /api/typebot/handoff` também retorna `handoffUrl` para redirecionar o visitante para o chat humano:

- `https://SUA-API-PUBLICA/handoff-view?tenantId=...&contactId=...&typebotUrl=...` (quando `typebotViewerUrl` é enviado)

## Roadmap de implementação

1. **Painel master**: CRUD de assinantes, bloqueio/desbloqueio, renovação manual.
2. **Provisionamento automático**: novo assinante já nasce com template padrão.
3. **Portal do assinante**:
   - configurar domínio de incorporação;
   - visualizar fila de atendimento;
   - escolher atendente para assumir conversa.
4. **Atendimento humano em tempo real**:
   - websocket para handoff;
   - lock de conversa (`in_service`) para evitar dois atendentes no mesmo contato.
5. **Billing**:
   - assinatura, renovação e bloqueio automático por inadimplência.

## Observações de segurança

- Não versionar credenciais reais em `.env`.
- Garantir que toda leitura/escrita em produção filtre por `tenant_id`.
- Não expor segredos de integração no frontend.
