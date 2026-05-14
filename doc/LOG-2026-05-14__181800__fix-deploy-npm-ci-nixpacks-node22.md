# Snapshot — deploy API Easypanel (`npm ci` + Node)

**Data:** 2026-05-14  
**Pedido:** Corrigir falha de build Nixpacks (`npm ci` EUSAGE, lock desincronizado, EBADENGINE Node 18).

## Alterações

- `package.json` (raiz): `workspaces` → `apps/*`, `packages/*`; `engines.node` ≥22.12.0; scripts sales com `--workspace @typebot-saas/sales`.
- `nixpacks.toml` (raiz): `NIXPACKS_NODE_VERSION = "22"`.
- `package-lock.json`: regenerado com `npm install` (importer raiz com `engines` alinhado).

## Comandos

- `Remove-Item node_modules; npm install` (raiz, ~12 min, exit 0).
- `Remove-Item node_modules; npm ci` (raiz, ~17 min, exit 0).

## Validação

- `npm ci` na raiz com Node 22.22 conclui sem erro após alinhamento.

## Pendências

- Commit + push; redeploy Easypanel serviço `api-typebot-crm`.
- Rotacionar segredos expostos nos logs de build do utilizador (JWT, passwords, DB URL) — fora do repo.
