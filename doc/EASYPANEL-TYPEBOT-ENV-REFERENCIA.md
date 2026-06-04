# Referência de ambiente — Typebot no Easypanel (projeto `typebot`)

Atualizado em **2026-06-02** após migração do projeto `soma`.

**Checklist completo (502 + login + upload):** [`doc/TYPEBOT-MIGRACAO-WALKUP-FIX-COMPLETO.md`](TYPEBOT-MIGRACAO-WALKUP-FIX-COMPLETO.md)

### Upload de imagens (`generateUploadUrl` → `INTERNAL_SERVER_ERROR`)

Correção já validada em produção (maio/2026): **env S3 no builder e no viewer** — não é fix na API SaaS.

1. Copiar bloco: [`doc/EASYPANEL-TYPEBOT-S3-UPLOAD-CORRECAO.env`](EASYPANEL-TYPEBOT-S3-UPLOAD-CORRECAO.env)
2. Easypanel → `typebot-walkup-builder` e `typebot-walkup-viewer` → remover `S3_PUBLIC_CUSTOM_DOMAIN` e `S3_ACCESS_KEY` com `@`
3. `S3_SECRET_KEY` = secret da access key **typebotstorage** (console MinIO, não o e-mail root)
4. Redeploy **builder**, depois **viewer**
5. VPS (opcional): `bash scripts/fix-typebot-s3-upload-vps.sh`

## URLs públicas

- Builder: `https://typebot-typebot-walkup-builder.achpyp.easypanel.host`
- Viewer: `https://typebot-typebot-walkup-viewer.achpyp.easypanel.host`
- MinIO: confirmar em **Domínios** do serviço `minio` (geralmente `https://typebot-minio.achpyp.easypanel.host`)

## Serviço `minio`

```env
MINIO_SERVER_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_BROWSER_REDIRECT_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_ROOT_USER=walkup@walkuptec.com.br
MINIO_ROOT_PASSWORD=<sua-senha>
```

## Serviço `typebot-walkup-builder`

```env
ENCRYPTION_SECRET=<mesmo-no-viewer>
NEXTAUTH_SECRET=<opcional-mesmo-encryption>
NODE_OPTIONS=--no-node-snapshot
PORT=3000
HOSTNAME=0.0.0.0

DATABASE_URL=postgresql://postgres:<senha>@<IP_DB>:5432/typebot
# IP na rede easypanel-typebot (jun/2026: 10.0.4.69). Hostname Swarm pode falhar (10.11.x).

NEXTAUTH_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host

ADMIN_EMAIL=walkup@walkuptec.com.br
DISABLE_SIGNUP=false

REDIS_URL=redis://:<senha-redis>@<IP_REDIS>:6379
# jun/2026: 10.0.4.71

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=walkup@walkuptec.com.br
SMTP_PASSWORD=<senha-de-app-google-16-chars>
SMTP_SECURE=true
SMTP_IGNORE_TLS=false
SMTP_AUTH_DISABLED=false
NEXT_PUBLIC_SMTP_FROM=walkup@walkuptec.com.br

S3_ENDPOINT=typebot-minio.achpyp.easypanel.host
S3_PORT=443
S3_SSL=true
S3_ACCESS_KEY=typebotstorage
S3_SECRET_KEY=<sem-caractere-@>
S3_BUCKET=typebot
```

**Importante:** não usar e-mail com `@` em `S3_ACCESS_KEY` (erro `invalid hostname` no upload).

## Serviço `typebot-walkup-viewer`

Mesmo `ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL` e bloco `S3_*` do builder.

```env
NEXTAUTH_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
PORT=3000
HOSTNAME=0.0.0.0
```

## API SaaS (serviço `api` — domínio `app.chattypebot.com`)

> O serviço antigo `api-typebot-crm` foi removido. Toda a API Node roda em **`api`**.

```env
TYPEBOT_BUILDER_API_BASE_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api
TYPEBOT_TARGET_VIEWER_BASE_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
# Avatar/ícone do bot no Typebot (logo público + reescrita URLs MinIO antigas)
TYPEBOT_AVATAR_PUBLIC_BASE_URL=https://app.chattypebot.com
TYPEBOT_S3_PUBLIC_BASE_URL=https://typebot-minio.achpyp.easypanel.host/typebot/public
```

## Painel (serviço `painel` — build)

```env
VITE_API_BASE_URL=https://app.chattypebot.com
VITE_WIDGET_BASE_URL=https://widget.chattypebot.com
VITE_SYSTEM_MASTER_TYPEBOT_BUILDER_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host/pt-BR/typebots
```

## Diagnóstico rápido

| Sintoma | Verificar |
|---------|-----------|
| 502 / Service not reachable | `PORT=3000`, `HOSTNAME=0.0.0.0`, domínio → porta 3000 |
| WRONGPASS Redis | `REDIS_URL` com host `typebot_typebot-walkup-redis` e senha atual |
| Login sem e-mail | SMTP Gmail (não cPanel) para Workspace |
| invalid hostname upload | S3 access key **sem @**; `S3_ENDPOINT` = domínio HTTPS MinIO |
| Imagens no fluxo OK, avatar/ícone quebrado | API com `TYPEBOT_S3_PUBLIC_BASE_URL` + `repair-media`; logo em `profileImageUrl` (data URI ou URL) |

Ver também: `doc/LOG-2026-05-18__205226__snapshot-encerramento-typebot-easypanel.md`
