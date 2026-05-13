# Snapshot — 2026-05-13 LP checkout localhost

## Causa

- Bundle com `VITE_API_BASE_URL` = localhost (Easypanel: variável duplicada ou ausente) + fallback em `salesApi.ts`.

## Alterações

- `salesApi.ts`: fallback localhost só `import.meta.env.DEV`; validação antes do `fetch`.
- `scripts/check-prod-vite-api.mjs` + `package.json` script `build`.
- `index.tsx`: `resolvePainelUrl() || "#"`.

## Deploy

- Push + redeploy Easypanel; env de **build** só HTTPS, sem duplicados.
