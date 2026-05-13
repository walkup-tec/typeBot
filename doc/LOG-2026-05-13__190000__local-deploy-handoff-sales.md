# Snapshot — 2026-05-13 handoff deploy LP

## Pedido

- Fazer tudo o que for local; avisar apenas quando for preciso deploy.

## Feito no repo

- `apps/sales/package.json`: `start` e `start:static` → `serve-production.mjs`.
- `apps/sales/nixpacks.toml`: `[start] cmd = "npm run start:static"`.
- `doc/memoria.md`: nota EPERM Windows vs build Easypanel.

## Validação local (agente)

- `npm ci` / `npm run build` em `apps/sales`: **EPERM** ao remover/instalar `node_modules` (OS). Não foi possível concluir build local aqui.
- Docker não disponível no ambiente para simular Nixpacks.

## Só no teu lado (deploy)

1. `git add` / `commit` / `push` do que quiseres publicar (incl. `apps/sales` se ainda não estiver no remoto).
2. Easypanel: redeploy do serviço da landing; porta interna = `PORT` (ex. 3000); TLS no domínio.
