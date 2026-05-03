# Pedido

Preparar publicação no VPS no domínio `chattypebot.com` (mesmo servidor que outros projetos).

# Alterações

- `apps/admin/src/App.tsx`: `apiBase` via `VITE_API_BASE_URL` (fallback localhost dev).
- `apps/admin/.env.example`: variáveis de build para produção.
- `doc/DEPLOY-VPS-chattypebot-com.md`: DNS, TLS, env da API, build, Nginx, PM2, persistência `apps/api/data`.
- `README.md`: nota de produção + link ao doc.

# Palavras-chave

- `chattypebot-com`
- `VITE_API_BASE_URL`
