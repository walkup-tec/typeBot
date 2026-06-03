# LOG 2026-06-03 — Swarm painel Pending (host-mode port in use)

## Diagnóstico externo (ChatGPT / usuário)
```
typebot_painel-typebot-crm.1  Pending
no suitable node (host-mode port already in use)
```

## Interpretação
- Swarm não consegue subir **nova task** no redeploy porque porta host (ex. **3002→3000**) já está presa ao container **antigo**.
- `docker service ls` mostra **1/1** (task velha) mas código novo **nunca entra**.
- Script Traefik patcha IP do container que existe — **não destrava deploy Swarm**.
- Mesmo padrão já visto: API **3333**, LP **3000** (`doc/memoria.md`).

## Evidência VPS anterior
- `typebot_painel-typebot-crm` → `0.0.0.0:3002->3000/tcp`
- `paginadevendas` → sem porta host (OK)

## Fix
1. Easypanel → **painel** → Portas → **remover** mapeamento host `3002:3000`
2. SSH: `docker service scale typebot_painel-typebot-crm=0` → aguardar → `=1`
3. `/root/traefik-permanent-vps.sh run`
4. Validar `painel.chattypebot.com` + redeploy painel pega código novo

## Pendente
- Confirmar `docker service ps typebot_painel-typebot-crm` no VPS
- Verificar se LP também tem task Pending oculta
