# LOG — Correção imagens Typebot (MinIO + avatar + repair)

**Data:** 2026-06-03  
**Pedido:** mesmo problema de carregamento de imagens no Typebot (histórico MinIO/S3 + data:image no icon).

## Causa (histórico projeto)

| Sintoma | Causa |
|---------|--------|
| `generateUploadUrl` / invalid hostname | `S3_ACCESS_KEY` com `@` |
| 500 no builder | `S3_PUBLIC_CUSTOM_DOMAIN` redundante |
| Topo do builder com lixo | `typebot.icon` com `data:image` base64 |
| Logo não aparece após sync | `TYPEBOT_AVATAR_PUBLIC_BASE_URL` vazio |

## Código implementado

1. `apps/api/src/typebot/typebot-media-sanitize.service.ts` — fallback `https://app.chattypebot.com`, sanitização schema, diagnóstico S3.
2. `apps/api/src/typebot/typebot-media-repair.service.ts` — reparo em lote workspace + fluxos.
3. `typebot-builder.service.ts` — icon via URL pública; schema sanitizado no sync.
4. `POST /api/master/tenants/:id/typebot/repair-media` — endpoint master.
5. Boot: `logTypebotStorageEnvDiagnostics()` em `server.ts`.

## Validar

1. Redeploy API com env `TYPEBOT_AVATAR_PUBLIC_BASE_URL=https://app.chattypebot.com`.
2. Builder/viewer: S3 sem `@` na key, sem `S3_PUBLIC_CUSTOM_DOMAIN` (ver `doc/TYPEBOT-MIGRACAO-WALKUP-FIX-COMPLETO.md`).
3. `POST https://app.chattypebot.com/api/master/tenants/<TENANT_ID>/typebot/repair-media` (auth master).
4. Abrir builder: upload de imagem no fluxo + ícone do workspace sem erro.

## Pendências infra (não código)

- MinIO policy `public/` readonly se imagem quebrada após upload OK.
- `DATABASE_URL` Typebot com hostname estável (não IP 10.0.4.69 morto).
