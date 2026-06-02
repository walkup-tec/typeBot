# Typebot — acesso e correção de 502 (atualizado 2026-06-02)

## URLs corretas (projeto Easypanel `typebot`)

| Uso | URL |
|-----|-----|
| **Builder (login / editar fluxos)** | https://typebot-typebot-walkup-builder.achpyp.easypanel.host |
| Lista de typebots (PT) | https://typebot-typebot-walkup-builder.achpyp.easypanel.host/pt-BR/typebots |
| **Viewer (chat público)** | https://typebot-typebot-walkup-viewer.achpyp.easypanel.host |
| MinIO | https://typebot-minio.achpyp.easypanel.host |

**Não usar (migração antiga):**

- `soma-typebot-walkup-builder...` / `soma-typebot-walkup-viewer...`
- `typebot-walkup-builder...` (sem o prefixo `typebot-typebot-`)

## Diagnóstico feito hoje

Teste externo (`curl` em `/signin`):

| Host | HTTP |
|------|------|
| `typebot-typebot-walkup-builder` | **502** |
| `typebot-walkup-builder` | **502** |
| `soma-typebot-walkup-builder` | **502** |

Conclusão: o **serviço Typebot Builder no Easypanel está fora** (container parado, porta errada ou app não escuta em `0.0.0.0`). Não é só URL errada no painel.

Após corrigir o builder, validar:

```bash
curl -sI https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin
# Esperado: HTTP/2 307 ou 200 (não 502)
```

E na API SaaS:

```bash
curl -s https://app.chattypebot.com/health | jq '.typebotBuilderReachable, .typebotBuilderHttpStatus'
# Esperado: true e status < 500
```

---

## Diagnóstico no VPS (cole no SSH)

```bash
curl -sSL https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/diagnose-typebot-vps.sh -o /tmp/diag-typebot.sh
bash /tmp/diag-typebot.sh
```

Ou, com o repo já no servidor:

```bash
bash /caminho/typeBot/scripts/diagnose-typebot-vps.sh
```

O script mostra: container Running?, app em `127.0.0.1:3000`, IP na rede `easypanel-typebot`, últimas linhas do log.

| Resultado do script | Ação |
|---------------------|------|
| Container **não** Running | Easypanel → **Start**; subir **db** e **redis** antes |
| Falha em `127.0.0.1:3000` | Corrigir env (ver abaixo) — ver log (Redis WRONGPASS, DB, ENCRYPTION) |
| OK interno, 502 público | Easypanel → **Domínios** porta **3000**; redeploy/restart builder |

---

## Passo a passo no Easypanel (corrigir 502)

### 1. Serviço `typebot-walkup-builder`

1. Easypanel → projeto **typebot** → **`typebot-walkup-builder`**
2. **Logs** — ver crash (Redis, DB, ENCRYPTION_SECRET, etc.)
3. **Environment** — conferir bloco mínimo:

```env
PORT=3000
HOSTNAME=0.0.0.0
NODE_OPTIONS=--no-node-snapshot

DATABASE_URL=postgresql://postgres:<SENHA>@typebot_typebot-walkup-db:5432/typebot
REDIS_URL=redis://:<SENHA_REDIS>@typebot_typebot-walkup-redis:6379

ENCRYPTION_SECRET=<mesmo no viewer>
NEXTAUTH_SECRET=<opcional igual encryption>

NEXTAUTH_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host

ADMIN_EMAIL=walkup@walkuptec.com.br
DISABLE_SIGNUP=false
```

4. **Domínios** → porta interna **3000** (não 3333)
5. **Restart** do serviço
6. Testar URL do builder no navegador

### 2. Serviço `typebot-walkup-viewer`

Mesmo `ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL`, bloco S3/MinIO:

```env
PORT=3000
HOSTNAME=0.0.0.0
NEXTAUTH_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
```

### 3. Dependências (se builder não sobe)

Ordem: **db** → **redis** → **minio** → **builder** → **viewer**

| Serviço | Host interno |
|---------|----------------|
| Postgres | `typebot_typebot-walkup-db` |
| Redis | `typebot_typebot-walkup-redis` |
| MinIO | `typebot-minio.achpyp.easypanel.host` (S3_ENDPOINT sem `https://`) |

Erros comuns: Redis `WRONGPASS`, `S3_ACCESS_KEY` com `@`, builder sem `HOSTNAME=0.0.0.0`.

### Caso real 2026-06-02 (seu VPS)

Log do builder:
```text
[ioredis] connect EHOSTUNREACH 10.11.227.126:6379
```

**Causa:** `REDIS_URL` no Easypanel apontava para **IP antigo** do Redis, não para o host Docker atual.

**Correção:** no Easypanel, serviços **builder** e **viewer**:

```env
REDIS_URL=redis://:<SENHA>@typebot_typebot-walkup-redis:6379
```

Gerar linha correta no VPS:

```bash
curl -sSL https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/fix-typebot-redis-url-vps.sh -o /tmp/fix-redis.sh
bash /tmp/fix-redis.sh
```

Restart builder + viewer → `curl -sI .../signin` deve retornar **307** (não 502).

---

## Variáveis na API SaaS (`api`)

```env
TYPEBOT_BUILDER_API_BASE_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api
TYPEBOT_BUILDER_API_TOKEN=<token builder>
TYPEBOT_TARGET_VIEWER_BASE_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
TYPEBOT_SOURCE_VIEWER_BASE_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
TYPEBOT_SOURCE_MASTER_WORKSPACE_ID=<id workspace matriz walkup>
TYPEBOT_SYSTEM_MASTER_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/pt-BR/typebots
```

Redeploy do serviço **`api`** após alterar env.

---

## Variáveis no painel (`painel-typebot-crm` — rebuild)

```env
VITE_API_BASE_URL=https://app.chattypebot.com
VITE_SYSTEM_MASTER_TYPEBOT_BUILDER_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/pt-BR/typebots
```

Botão **Typebot** no header do master usa essa URL.

---

## Acesso por assinante (workspace direto)

No `.env` da API (opcional):

```env
TYPEBOT_TENANT_URL_TEMPLATE=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/w/{tenantId}/typebots
```

Ou URL fixa do workspace gravada em `typebotAccessUrl` no cadastro do assinante.

Fluxo no painel: **Assinantes** → **Ativar Typebot** → **Acessar Typebot** (abre `typebotAccessUrl`).

---

## Histórico de referência no repositório

| Documento | Conteúdo |
|-----------|----------|
| `doc/EASYPANEL-TYPEBOT-ENV-REFERENCIA.md` | Env completo builder/viewer/minio |
| `doc/LOG-2026-05-18__205226__snapshot-encerramento-typebot-easypanel.md` | Migração soma→typebot, 502 PORT/HOSTNAME |
| `doc/LOG-2026-04-22__181500__typebot-acesso-direto-por-tenant.md` | `TYPEBOT_TENANT_URL_TEMPLATE` |
| `doc/FIX-EASYPANEL-TRAEFIK-ESTAVEL.md` | 502 em LP/painel/API (não builder achpyp) |
| `scripts/diagnose-typebot-access.ps1` | Teste rápido de URLs |

---

## Ordem de deploy hoje

1. Subir **builder** + **viewer** (fim do 502)
2. Redeploy **api** (env Typebot + health com probe)
3. Rebuild **painel** (`VITE_SYSTEM_MASTER_TYPEBOT_BUILDER_URL`)
4. Login master → botão Typebot ou Biblioteca Master → sync
