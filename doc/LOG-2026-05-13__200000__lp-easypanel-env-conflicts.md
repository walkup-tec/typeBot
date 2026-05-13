# Snapshot — 2026-05-13 LP env Easypanel conflitos

## Problema

- Env do serviço LP com duplicados: `VITE_*` produção + localhost; `PORT` 3000 vs 3333; variáveis da API misturadas; comentários/doc colados no painel.

## Causa provável

- Último `PORT`/`VITE_*` a vencer → mismatch com proxy ou bundle com localhost.

## Repo

- `apps/sales/.env.example`: aviso Easypanel + remoção de tokens em comentários.

## Ação utilizador

- Easypanel LP: env mínimo (ver resposta no chat). API: env completo noutro serviço. Redeploy. Rodar chaves Asaas se expostas.
