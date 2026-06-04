# Deploy marker — imagens Typebot + etapa 6 status + painel /health

## Commits no pacote (já em master antes deste marker)

- `c117cc9` — repair-media, sanitize imagens
- `19b4cf3` — status Ativo assinante etapa 6
- `de30225` — serve-production + traefik watch/timer (ops VPS)

## Marker deste commit

- API: `DEPLOY-2026-06-04-typebot-imagens-etapa6-status-ativo`
- Admin: mesmo marker
- Biblioteca: `walkup-etapa6-status-imagens-v20`

## Easypanel

1. Redeploy **api** → validar `GET /health` com marker novo
2. Redeploy **painel** → etapa 6 CLT Ativo; `/health` 200
3. VPS: traefik watch/timer já instalado (sem SSH por deploy)
