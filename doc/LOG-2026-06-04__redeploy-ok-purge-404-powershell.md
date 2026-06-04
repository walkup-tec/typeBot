# LOG 2026-06-04 — Redeploy OK, purge 404, PowerShell curl

## Contexto
- Usuário finalizou redeploy Easypanel API.
- Tentou `curl -sS -X POST .../purge-extra-users` no PowerShell → erro parâmetro `sS`.

## Validações
- `GET https://app.chattypebot.com/health` → marker `DEPLOY-2026-06-03-typebot-legacy-minio-hostavatar`, `tenantsCount: 2`
- `POST .../purge-extra-users` → 404 `Cannot POST`

## Causa
- Produção com build do fix hostAvatar; commit `b44b97a` (rota purge) ainda não na imagem em execução.
- `curl` no PowerShell = alias de `Invoke-WebRequest` (flags Linux inválidas).

## Pendências
1. Redeploy API apontando `b44b97a` / `[6258c2c] feat: purgar usuarios...`
2. Purge: `Invoke-RestMethod -Uri "https://app.chattypebot.com/api/master/system/purge-extra-users" -Method POST`
3. Avatar viewer: painel → assinante → Etapa 6 → Atualizar lista
