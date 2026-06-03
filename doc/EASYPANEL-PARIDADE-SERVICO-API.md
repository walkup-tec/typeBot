# Easypanel — paridade do serviço `api` (ex-`api-typebot-crm`)

Desde o problema de proxy (mai/2026), o que estava **maduro** no **`api-typebot-crm`** precisa existir no serviço **`api`** (domínio `app.chattypebot.com`). Traefik usa **`http://172.17.0.1:3333`** — só funciona se o container **`api`** publicar a porta **3333** no host e estiver **Running**.

## Sintoma atual (502)

- `api-typebot-crm` **parado** → nada na 3333 **se** o `api` não publicar 3333 ou não subir.
- Redeploy sem volume/env do antigo → API “nova” vazia ou quebrada.

---

## Checklist de paridade (copiar do `api-typebot-crm` → `api`)

### 1. Fonte / build (já OK no seu print)

| Item | Valor |
|------|--------|
| Repo | `github.com/walkup-tec/typeBot` |
| Branch | `master` |
| Install | `npm ci` |
| Build | `npm run build:api` |
| Start | `npm run start:api` |
| Código Pix Automático | commit ≥ `59869d2` (ideal `b833624`) |

### 2. Runtime obrigatório (fix 502 / bind)

```env
NODE_ENV=production
PORT=3333
HOST=0.0.0.0
```

- Engrenagem / porta HTTP do app: **3333**
- **Publicar porta 3333** no host (igual tinha no `api-typebot-crm`) — sem isso Traefik → 502

### 3. Domínios (só no `api`)

- `app.chattypebot.com`
- (opcional) `typebot-api.achpyp.easypanel.host` ou host Easypanel do serviço **`api`**
- **Remover** `app.chattypebot.com` de qualquer outro serviço
- Não usar URL inválida `https://api-typebot-crm/`

### 4. URLs públicas (substituir pelos seus)

```env
HANDOFF_PUBLIC_BASE_URL=https://app.chattypebot.com
TYPEBOT_HANDOFF_WEBHOOK_URL=https://app.chattypebot.com/api/typebot/handoff
SYSTEM_LOGIN_URL=https://painel.chattypebot.com
WIDGET_BASE_URL=https://widget.chattypebot.com
```

### 5. Postgres (login / assinantes — se já usava)

```env
DATABASE_URL=postgresql://...
# opcional: AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION=true
```

Sem `DATABASE_URL`, login usa JSON no volume (`tenants.json`, `attendants.json`).

### 6. Volume (fluxos, fila, pedidos billing)

Montar **o mesmo volume** que o `api-typebot-crm` usava:

| Mount no container | Conteúdo |
|--------------------|----------|
| `/app/apps/api/data` | `saved-flows.json`, `queue-state.json`, `billing-orders.json`, `tenants.json`, etc. |

Confirmar após subir: `GET /health` → `operationalDataDirectory`, `tenantsCount` coerentes.

### 7. Asaas + vendas (landing)

```env
ASAAS_API_KEY=...
ASAAS_API_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_ACCESS_TOKEN=...
SALES_PLAN_MONTHLY_VALUE=290.00
SALES_PLAN_YEARLY_VALUE=2280.00
SALES_LANDING_URL=https://chattypebot.com
SALES_CHECKOUT_SUCCESS_URL=https://painel.chattypebot.com
SALES_CHECKOUT_CANCEL_URL=https://chattypebot.com
SALES_CHECKOUT_EXPIRED_URL=https://chattypebot.com
# Pix Automático (mensal):
# BILLING_PIX_AUTOMATIC_PAYMENT_MODE=SUBSCRIPTION
```

Webhook Asaas: `POST https://app.chattypebot.com/api/webhooks/asaas`

### 8. Typebot (builder / viewer / sync)

Tudo que estava no `api-typebot-crm`:

```env
TYPEBOT_BUILDER_API_BASE_URL=...
TYPEBOT_BUILDER_API_TOKEN=...
TYPEBOT_SOURCE_VIEWER_BASE_URL=...
TYPEBOT_TARGET_VIEWER_BASE_URL=...
TYPEBOT_AUTO_CREATE_WORKSPACE=true
TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS=true
# ... demais TYPEBOT_* do .env antigo
```

Referência completa: `doc/EASYPANEL-AMBIENTE.env.example`

### 9. E-mail (SMTP)

Copiar `SMTP_*`, `MAIL_FROM`, `MAIL_MODE` do serviço antigo.

### 10. Traefik no VPS (após `api` Running + porta 3333)

```bash
bash /root/fix-traefik-easypanel-502.sh
```

Garante API → `172.17.0.1:3333`. Ver `doc/FIX-EASYPANEL-TRAEFIK-ESTAVEL.md`

### 11. Validar (PowerShell)

```powershell
Invoke-RestMethod "https://app.chattypebot.com/health"
(Invoke-RestMethod "https://app.chattypebot.com/api/public/sales/plans").billingCapabilities
```

Esperado: `status ok` + `version: 2026-06-01-pix-automatic`

### 12. Só então excluir `api-typebot-crm`

- `api` com health OK, dados e env completos
- `api-typebot-crm` parado e **sem** domínio
- Manter volume antigo até confirmar que o `api` monta o mesmo disco/dados

---

## O que mudou desde o proxy (não esquecer no `api`)

| Data / tema | O quê |
|-------------|--------|
| 2026-05-28 | `HOST=0.0.0.0`, `PORT=3333`, serviço renomeado/duplicado para `api` |
| Traefik | API via `172.17.0.1:3333`, script `fix-traefik-easypanel-502.sh` |
| Postgres | `DATABASE_URL` para tenants/atendentes |
| Volume | `/app/apps/api/data` persistente |
| Asaas checkout | `/checkouts`, planos públicos `/api/public/sales/*` |
| 2026-06-01 | Pix Automático mensal (`59869d2`, `b833624`) |

---

## Erro comum

| Situação | Causa |
|----------|--------|
| Redeploy `api` mas `/plans` sem `billingCapabilities` | Tráfego ainda ia para `api-typebot-crm` na 3333 |
| Parou `api-typebot-crm` e 502 | `api` sem porta 3333 publicada ou container down |
| “Deploy certo” no Git | Env/volume/porta diferentes do serviço antigo |

Referências: `doc/FIX-EASYPANEL-API-502-DOMINIO.md`, `doc/LOG-2026-05-28__190000__snapshot-pausa-proxy-traefik.md`, `doc/REDEPLOY-PIX-AUTOMATICO.md`
