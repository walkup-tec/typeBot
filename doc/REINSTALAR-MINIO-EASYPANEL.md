# Reinstalar MinIO no Easypanel (do zero)

Use quando persistir 502, TERMINATED, ou "Access Key Id does not exist".

## Antes de apagar

- Anote senhas atuais (ou decida senhas novas).
- **Bucket `typebot` e imagens antigas** somem se apagar o **volume** `/data`.
- Typebot (builder/viewer) pode ficar sem storage até reconfigurar `S3_*`.

---

## Passo 1 — Parar dependências (opcional)

Não é obrigatório parar builder/viewer; só não teste upload até o fim.

---

## Passo 2 — Remover serviço MinIO

Easypanel → projeto **typebot** → serviço **minio**:

1. **Stop**
2. **Delete** o serviço
3. Se perguntar sobre volume: para reinstalação **limpa**, pode **apagar o volume** (perde dados MinIO). Para manter dados, **não** apague o volume (só se souber remontar em `/data`).

---

## Passo 3 — Criar MinIO novo

1. **+ Add Service** → template **MinIO** (ou Docker `minio/minio:latest`)
2. Nome: `minio`

### Environment

```env
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=SUBSTITUA_SENHA_FORTE_32_CHARS
MINIO_SERVER_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_BROWSER_REDIRECT_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_REGION=us-east-1
```

### Deploy

| Campo | Valor |
|-------|--------|
| Arguments | `server` `/data` `--console-address` `:9001` |
| Volume | `/data` (novo volume) |
| Réplicas | 1 |

### Domínio

| Campo | Valor |
|-------|--------|
| Host | `typebot-minio.achpyp.easypanel.host` |
| HTTPS | Sim |
| Destino | HTTP porta **9000** |

### Deploy / Start

Aguardar logs **sem** `TERMINATED` repetido.

---

## Passo 4 — Validar (PowerShell)

```powershell
curl.exe -sS -o NUL -w "health: %{http_code}`n" https://typebot-minio.achpyp.easypanel.host/minio/health/live
```

Esperado: **200**.

Console do container:

```sh
curl -s -o /dev/null -w "9000=%{http_code}\n" http://127.0.0.1:9000/minio/health/live
```

Esperado: **9000=200**.

---

## Passo 5 — Configurar MinIO (browser)

1. https://typebot-minio.achpyp.easypanel.host
2. Login: `admin` + senha do passo 3
3. **Create bucket** → `typebot`
4. **Access Keys** → Create:
   - Access Key: `typebotstorage`
   - Secret: anotar (sem `@`)

### CORS no bucket `typebot` (Typebot upload)

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}
```

---

## Passo 6 — Builder e Viewer (obrigatório)

**typebot-walkup-builder** e **typebot-walkup-viewer** — mesmo bloco:

```env
S3_ENDPOINT=typebot-minio.achpyp.easypanel.host
S3_PORT=443
S3_SSL=true
S3_ACCESS_KEY=typebotstorage
S3_SECRET_KEY=SECRET_DO_PASSO_5
S3_BUCKET=typebot
```

Remover linhas antigas com `walkup@` em `S3_ACCESS_KEY`.

**Redeploy builder** → **Redeploy viewer**.

Viewer também:

```env
PORT=3000
HOSTNAME=0.0.0.0
```

---

## Passo 7 — Teste Typebot

1. Ctrl+F5 no builder
2. Tema → Avatar → upload
3. Sem toast `generateUploadUrl` / Access Key

---

## Se "Access Key does not exist" após reinstall

| Verificar |
|-----------|
| Key criada **depois** do reinstall |
| `S3_ACCESS_KEY` = nome exato (`typebotstorage`) |
| `S3_SECRET_KEY` = secret da key, não senha do admin |
| Redeploy **builder** feito após mudar env |
| Bucket `typebot` existe |

Teste temporário com root (só diagnóstico):

```env
S3_ACCESS_KEY=admin
S3_SECRET_KEY=<MINIO_ROOT_PASSWORD>
```

Se funcionar → problema era key; recrie `typebotstorage` e volte.

---

## Não reinstalar se

- `health` já retorna **200** e só falta access key → só passos 5–6, sem delete.
