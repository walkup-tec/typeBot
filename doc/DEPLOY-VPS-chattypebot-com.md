# Deploy no VPS — domínio `chattypebot.com`

Mesmo servidor que outros projetos (ex.: Credilix): novo **server block** (Nginx / Traefik / Easypanel) com hostname diferente e porta ou stack própria para esta API.

## 1. DNS

No registador do domínio:

| Tipo | Nome | Valor |
|------|------|--------|
| A | `@` ou `www` | IP público do VPS |
| A | `api` (recomendado) | mesmo IP |
| A | `widget` (opcional) | mesmo IP |

Podes usar só `chattypebot.com` para o admin e `api.chattypebot.com` para a API (padrão abaixo).

## 2. TLS

Usa o mesmo fluxo que já tens no VPS (Certbot, painel Easypanel, etc.) para emitir certificado para:

- `api.chattypebot.com`
- `chattypebot.com` (e/ou `www`)
- `widget.chattypebot.com` se existir

## 3. Variáveis da API (`.env` no servidor, pasta da API)

Valores ilustrativos — ajusta ao teu layout real:

```env
NODE_ENV=production
PORT=3333

# Links que o handoff e redirects geram (HTTPS + host público).
HANDOFF_PUBLIC_BASE_URL=https://api.chattypebot.com

# URL que o builder usa ao aplicar webhooks nos fluxos Typebot (se usas esta env).
TYPEBOT_HANDOFF_WEBHOOK_URL=https://api.chattypebot.com/api/typebot/handoff

# Widget embed / links internos do painel (se usares estes fluxos).
WIDGET_BASE_URL=https://widget.chattypebot.com

# Iframe do painel (Fila ao vivo) embute /handoff-view — hosts permitidos:
FRAME_ANCESTORS=https://painel.chattypebot.com https://app.chattypebot.com
```

Mantém o resto (`TYPEBOT_BUILDER_API_*`, SMTP, etc.) como já configuraste para ambiente real.

**Headers:** o reverse proxy deve enviar `X-Forwarded-Proto` e `Host` corretos (o código já usa `x-forwarded-*` onde faz sentido).

## 4. Build no servidor (ou CI → artefactos)

Na raiz do repo `typebot-Saas`:

```bash
npm ci
npm run build:api
```

**Admin (obrigatório definir a API pública no build):**

```bash
export VITE_API_BASE_URL=https://api.chattypebot.com
export VITE_WIDGET_BASE_URL=https://widget.chattypebot.com
npm run build:admin
```

**Widget** (por tenant ou genérico):

```bash
export VITE_API_BASE_URL=https://api.chattypebot.com
export VITE_TENANT_ID=<tenant-demo>
export VITE_TYPEBOT_PUBLIC_URL=https://<viewer>/<publicId>
npm run build:widget
```

Saídas:

- API: `apps/api/dist/`
- Admin: `apps/admin/dist/`
- Widget: `apps/widget/dist/`

## 5. Persistência

Estado em ficheiros JSON sob `apps/api/data/` (fora do repo em produção). Garante **volume ou backup** dessa pasta no VPS.

## 6. Processo da API

Exemplo com PM2:

```bash
cd apps/api
pm2 start dist/server.js --name typebot-saas-api
pm2 save
```

## 7. Nginx — API (`api.chattypebot.com`)

```nginx
server {
  listen 443 ssl http2;
  server_name api.chattypebot.com;

  location / {
    proxy_pass http://127.0.0.1:3333;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    client_max_body_size 8m;
  }
}
```

## 8. Nginx — Página de vendas (`chattypebot.com`)

Servir o app TanStack Start em `apps/sales` (SSR Node). O painel admin fica em `painel.chattypebot.com`.

Build (no serviço Easypanel da landing, pasta `apps/sales`, **sem** workspace npm da raiz):

```bash
export VITE_API_BASE_URL=https://api.chattypebot.com
export VITE_PAINEL_URL=https://painel.chattypebot.com
npm ci
npm run build
```

Arranque:

```bash
export PORT=3000
node scripts/serve-production.mjs
```

Proxy reverso (porta interna 3000):

```nginx
server {
  listen 443 ssl http2;
  server_name chattypebot.com www.chattypebot.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }
}
```

## 9. Nginx — Admin estático (`painel.chattypebot.com`)

```nginx
server {
  listen 443 ssl http2;
  server_name painel.chattypebot.com;
  root /var/www/chattypebot-admin/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

(`root` = caminho onde envias `apps/admin/dist`.)

## 10. Widget

Servir `apps/widget/dist` num hostname à parte ou subpath; respeitar `VITE_*` usados no build.

## 11. Depois do deploy

1. `curl -sS https://api.chattypebot.com/health`
2. Abrir `https://chattypebot.com` e confirmar checkout/assinatura contra a API (DevTools → Network).
3. Abrir `https://painel.chattypebot.com` e confirmar login/chamadas à API.
3. Handoff Typebot:
   - **Webhook (POST):** `TYPEBOT_HANDOFF_WEBHOOK_URL` → ex. `https://app.chattypebot.com/api/typebot/handoff` ou `https://api.chattypebot.com/api/typebot/handoff`
   - **Redirect:** usar variável `{{url_direct}}` da resposta do webhook (não a URL do webhook).
   - **GET** no mesmo path redireciona (302) para `/handoff-view` — necessário se o bloco Redirect apontar direto para `/api/typebot/handoff`.

## Palavras-chave

- `chattypebot-com-vps`
- `VITE_API_BASE_URL-producao`
- `HANDOFF_PUBLIC_BASE_URL`
