# MinIO no Easypanel — corrigir 502 e loop TERMINATED

## Sintoma

- Browser: "Service is not reachable"
- `curl`: HTTP **502**
- Logs: MinIO inicia → `INFO: Exiting on signal: TERMINATED` → repete

## Causa

O **proxy** do Easypanel não consegue falar com o processo MinIO (container parado, porta errada ou health check matando o container).

---

## Plano A — Reconfigurar serviço `minio` (recomendado)

### 1. Parar o serviço

Easypanel → projeto **typebot** → **minio** → **Stop** (aguardar parar).

### 2. Deploy settings

| Campo | Valor |
|-------|--------|
| Réplicas | **1** |
| Command | *(vazio — usar ENTRYPOINT da imagem)* |
| Arguments | `server` `/data` `--console-address` `:9001` |

*(Se o painel tiver um único campo "Command", use: `server /data --console-address :9001`)*

### 3. Environment (teste mínimo — sem URL externa primeiro)

```env
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=TypebotMinio2026!
```

**Não** coloque `MINIO_SERVER_URL` ainda. Adicione depois que o 502 sumir.

### 4. Mount (obrigatório)

| Tipo | Mount path |
|------|------------|
| Volume | `/data` |

### 5. Domínio

| Campo | Valor |
|-------|--------|
| Host | `typebot-minio.achpyp.easypanel.host` |
| HTTPS | Sim |
| Destino protocolo | HTTP |
| Destino porta | **9000** |

*(API S3; console pode abrir em `/` na versão recente ou testar domínio duplicado na 9001)*

### 6. Start (uma vez)

**Start** → aguarde 60 s **sem** clicar Redeploy de novo.

### 7. Logs

Deve aparecer só o banner MinIO, **sem** `TERMINATED` em seguida.

### 8. Teste (PowerShell)

```powershell
curl.exe -sS -o NUL -w "MinIO: %{http_code}`n" https://typebot-minio.achpyp.easypanel.host/
curl.exe -sS -o NUL -w "health: %{http_code}`n" https://typebot-minio.achpyp.easypanel.host/minio/health/live
```

Esperado: **200** ou **403**, não **502**.

### 9. Só depois adicionar URLs

```env
MINIO_SERVER_URL=https://typebot-minio.achpyp.easypanel.host
MINIO_BROWSER_REDIRECT_URL=https://typebot-minio.achpyp.easypanel.host
```

Redeploy → testar de novo.

---

## Plano B — Teste dentro do container (Console Easypanel)

Easypanel → **minio** → **Console** → **Launcher**:

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/minio/health/live
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9001/minio/health/live
```

| Resultado | Significado |
|-----------|-------------|
| 200 no 9000 | Domínio Easypanel deve apontar para **9000** |
| 200 no 9001 | Domínio do browser pode ser **9001** |
| connection refused | MinIO não está escutando — comando/volume errado |
| 200 interno mas 502 externo | Porta do **domínio** errada no Easypanel |

---

## Plano C — Recriar serviço MinIO do zero

Se Plano A falhar:

1. Anotar senha e nome do volume `/data` (não apagar volume se quiser manter dados).
2. **Delete** serviço `minio` (ou criar novo `minio2`).
3. **Create** → template **MinIO** ou imagem `minio/minio:latest`.
4. User `admin`, password forte, volume `/data`, domínio porta **9000**.
5. Start e testar curl.

---

## Plano D — Se continuar TERMINATED

| Verificar | Ação |
|-----------|------|
| RAM do VPS | Subir limite do serviço minio (512MB–1GB) |
| Health check custom | Desativar ou path `/minio/health/live` porta **9000** |
| Múltiplos redeploys | Parar 2 min entre tentativas |
| `@` no user | Usar `admin`, não e-mail |

---

## Depois que MinIO = 200

1. Console → bucket `typebot`
2. Access Keys → `typebotstorage` + secret (sem `@`)
3. Builder + Viewer:

```env
S3_ENDPOINT=typebot-minio.achpyp.easypanel.host
S3_PORT=443
S3_SSL=true
S3_ACCESS_KEY=typebotstorage
S3_SECRET_KEY=<secret>
S3_BUCKET=typebot
```

4. Viewer também: `PORT=3000`, `HOSTNAME=0.0.0.0`
