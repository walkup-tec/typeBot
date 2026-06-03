# LOG 2026-06-03 — LP/painel/builder 502 após traefik-permanent

## Contexto / solicitação aberta
- Usuário reportou: `RESULTADO lp:502 painel:502 app:200 builder_signin:502`
- API responde via Traefik; LP, painel e builder Typebot ainda 502.

## Alterações no repo
- `scripts/diagnose-502-lp-painel-vps.sh` — diagnóstico completo (containers, IPs, wget interno Traefik→LP/painel/builder, trechos main.yaml)
- `scripts/traefik-permanent-vps.sh` — restart Traefik quando painel **ou** LP 502 após patch main.yaml
- Commit: `d91b741` (push master)

## Comandos executados (local)
- `git commit` + `git push origin master`

## Validações
- Push OK; scripts ainda **não rodados no VPS** nesta sessão.

## Pendências para retomada
1. No VPS (root): `git pull` no repo ou copiar scripts; rodar `bash scripts/diagnose-502-lp-painel-vps.sh` e colar saída.
2. Rodar `/root/traefik-permanent-vps.sh run` (ou `install` se cron ausente).
3. Se wget interno FALHAR → Easypanel: serviços **paginadevendas** e **painel** Running + redeploy.
4. Se wget OK mas HTTPS 502 → `docker restart` Traefik após patch.
5. API marker antigo → scale api 0→1 no Easypanel.
6. Builder 502 → script builder proxy ou IP atual na rede typebot.
