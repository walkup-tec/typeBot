# Snapshot — painel 502 pos-redeploy API (Traefik)

**Data:** 2026-06-03

## Sintoma
- `painel.chattypebot.com` → Bad Gateway (502)
- `chattypebot.com` → 502
- `app.chattypebot.com/health` → 200 mas marker antigo `DEPLOY-2026-06-02`

## Causa
Redeploy Easypanel troca IP dos containers Swarm; Traefik (`main.yaml`) aponta para IP/hostname morto. **Nao e bug do codigo da Biblioteca Master.**

## Acao imediata (VPS root)
```bash
/root/traefik-permanent-vps.sh run
# ou se nao instalado:
bash fix-traefik-easypanel-502.sh
```
Esperado: `RESULTADO lp:200 painel:200 app:200`

## Depois
1. Confirmar `/health` → `DEPLOY-2026-06-03-api-biblioteca-v3-safe`
2. Se marker antigo: Easypanel api → scale 0 → scale 1
3. Redeploy painel (build admin)

## Repo
- `c7147d0` traefik fallback servico `painel`
