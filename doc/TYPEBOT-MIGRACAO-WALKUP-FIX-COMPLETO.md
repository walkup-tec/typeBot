# Typebot — fix completo migração soma → walkup (2026-06)

Checklist único com tudo que já funcionou em **maio/2026** + correções **Swarm DNS** (jun/2026).

## URLs (não usar `soma-*`)

| Serviço | URL |
|---------|-----|
| Builder login | https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin |
| Viewer | https://typebot-typebot-walkup-viewer.achpyp.easypanel.host |
| MinIO API | https://typebot-minio.achpyp.easypanel.host |
| MinIO Console | https://console-typebot-minio.achpyp.easypanel.host (se configurado) |

---

## 1. Infra base (ordem no Easypanel)

1. `typebot-walkup-db` → Running  
2. `typebot-walkup-redis` → Running  
3. `minio` → Running, domínio API porta **9000** (HTTPS)  
4. `typebot-walkup-builder` → `PORT=3000`, `HOSTNAME=0.0.0.0`  
5. `typebot-walkup-viewer` → idem  

---

## 2. DNS Swarm morto → usar IP na rede `easypanel-typebot`

Sintoma: 502, login falha, Prisma `Can't reach database`, Redis `EHOSTUNREACH 10.11.x`.

No VPS, IPs atuais (mudam após redeploy):

```bash
docker inspect $(docker ps -q -f name=typebot-walkup-db -f status=running | head -1) \
  --format 'DB={{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}'
docker inspect $(docker ps -q -f name=typebot-walkup-redis -f status=running | head -1) \
  --format 'REDIS={{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}'
docker inspect $(docker ps -q -f name=typebot-walkup-builder -f status=running | head -1) \
  --format 'BUILDER={{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}'
docker inspect $(docker ps -q -f name=typebot-walkup-viewer -f status=running | head -1) \
  --format 'VIEWER={{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}'
docker inspect $(docker ps -q -f name=minio -f status=running | head -1) \
  --format 'MINIO={{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}'
```

**Builder + viewer** (substituir `<SENHA>` pelas atuais do Easypanel):

```env
DATABASE_URL=postgresql://postgres:<SENHA_DB>@<IP_DB>:5432/typebot
REDIS_URL=redis://:<SENHA_REDIS>@<IP_REDIS>:6379
```

Exemplo estável em jun/2026: DB `10.0.4.69`, Redis `10.0.4.71`.

**Traefik** (após cada redeploy de builder/viewer/minio):

```bash
bash scripts/fix-typebot-migracao-walkup-completo-vps.sh
```

---

## 3. Login por e-mail (magic link)

**Não** usar `mail.walkuptec.com.br` (cPanel) para `walkup@walkuptec.com.br` (Google Workspace).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=walkup@walkuptec.com.br
SMTP_PASSWORD=<senha-de-app-google-16-chars>
SMTP_SECURE=true
SMTP_IGNORE_TLS=false
SMTP_AUTH_DISABLED=false
NEXT_PUBLIC_SMTP_FROM=walkup@walkuptec.com.br
```

---

## 4. Upload de imagens / ícone (`generateUploadUrl` / `INTERNAL_SERVER_ERROR`)

### Causas já resolvidas antes

| Erro | Causa | Correção |
|------|--------|----------|
| `invalid hostname` | `S3_ACCESS_KEY` com `@` (ex. e-mail) | Key **sem @**, ex. `typebotstorage` |
| `INTERNAL_SERVER_ERROR` em `generateUploadUrl` | Key/secret errados, MinIO 502, ou `S3_PUBLIC_CUSTOM_DOMAIN` | Ver bloco S3 abaixo |
| Access Key does not exist | Env builder ≠ key criada no MinIO | Recriar key no console + redeploy builder |
| Imagem quebrada após upload | Bucket sem policy `public/` | Policy no MinIO (ver `doc/REINSTALAR-MINIO-EASYPANEL.md`) |

### MinIO (serviço `minio`)

```env
MINIO_SERVER_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_BROWSER_REDIRECT_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_ROOT_USER=walkup@walkuptec.com.br
MINIO_ROOT_PASSWORD=<senha-minio>
```

Console MinIO:

1. Bucket **`typebot`** existe  
2. Access Key dedicada: **`typebotstorage`** + secret (anotar)  
3. **Não** colocar e-mail em `S3_ACCESS_KEY`  
4. Policy `public/` readonly (upload em `public/`)

Teste externo:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://typebot-minio.achpyp.easypanel.host/minio/health/live
# Esperado: 200
```

### Builder + viewer (mesmo bloco S3)

```env
S3_ENDPOINT=typebot-minio.achpyp.easypanel.host
S3_PORT=443
S3_SSL=true
S3_ACCESS_KEY=typebotstorage
S3_SECRET_KEY=<secret-da-key-no-console-minio>
S3_BUCKET=typebot
```

**Remover** do builder/viewer se existir:

- `S3_PUBLIC_CUSTOM_DOMAIN` (causou 500 no builder em maio/2026)  
- Linhas `S3_*` com `walkup@` na access key  
- `S3_ENDPOINT=https://...` (sem `https://` — só hostname)

Após alterar env: **Redeploy builder** → **Redeploy viewer** → atualizar IPs no Traefik (script acima).

---

## 5. Bloco completo builder (referência)

```env
ENCRYPTION_SECRET=<mesmo-no-viewer>
NEXTAUTH_SECRET=<opcional-igual-encryption>
NODE_OPTIONS=--no-node-snapshot
PORT=3000
HOSTNAME=0.0.0.0

DATABASE_URL=postgresql://postgres:<SENHA>@<IP_DB>:5432/typebot
REDIS_URL=redis://:<SENHA_REDIS>@<IP_REDIS>:6379

NEXTAUTH_URL=https://typebot-typebot-walkup-builder.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host

ADMIN_EMAIL=walkup@walkuptec.com.br
DISABLE_SIGNUP=false

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=walkup@walkuptec.com.br
SMTP_PASSWORD=<app-password>
SMTP_SECURE=true
SMTP_IGNORE_TLS=false
SMTP_AUTH_DISABLED=false
NEXT_PUBLIC_SMTP_FROM=walkup@walkuptec.com.br

S3_ENDPOINT=typebot-minio.achpyp.easypanel.host
S3_PORT=443
S3_SSL=true
S3_ACCESS_KEY=typebotstorage
S3_SECRET_KEY=<secret-minio-key>
S3_BUCKET=typebot
```

Viewer: copiar `ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `S3_*` +:

```env
NEXTAUTH_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
NEXT_PUBLIC_VIEWER_URL=https://typebot-typebot-walkup-viewer.achpyp.easypanel.host
PORT=3000
HOSTNAME=0.0.0.0
```

---

## 6. Fluxos 404 no viewer

- Slug antigo (`drax-sistemas-px5k4a3`) pode não existir no DB atual.  
- Slug no Postgres: `drax-sistemas-d3hpop9` → publicar no builder (**Publish**).  
- Viewer precisa do mesmo `DATABASE_URL` (IP) que o builder.

---

## Scripts

| Script | Uso |
|--------|-----|
| `scripts/fix-typebot-migracao-walkup-completo-vps.sh` | Traefik IPs + auditoria env S3/DB/Redis |
| `scripts/fix-typebot-builder-proxy-502-vps.sh` | Só proxy builder/viewer |
| `doc/REINSTALAR-MINIO-EASYPANEL.md` | MinIO do zero |
| `doc/LOG-2026-05-19__124544__minio-typebot-upload-resolvido.md` | Caso resolvido maio/2026 |

## Documentos históricos

- `doc/LOG-2026-05-18__205226__snapshot-encerramento-typebot-easypanel.md`  
- `doc/EASYPANEL-TYPEBOT-ENV-REFERENCIA.md`  
- `doc/TYPEBOT-ACESSO-E-502-HOJE.md`
