# Snapshot — e-mail boas-vindas somaconecta

**Data:** 2026-06-04

## Solicitação

Usuário recriou assinante `somaconecta@gmail.com` e não recebeu e-mail de boas-vindas.

## Diagnóstico

- Tenant em produção: `1f992ff8-741b-451d-b3c8-bb08ec1ba92a` (Soma Promotora), criado 2026-06-04T17:14:44Z.
- `/health` não expunha `smtpConfigured` (null no teste) — indício de SMTP ausente no serviço **API** Easypanel.
- A API usa `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` / `MAIL_MODE=smtp` — **não** `SMTP_USERNAME` / `NEXT_PUBLIC_SMTP_FROM` (Typebot).
- Admin `createTenant()` ignorava `emailDelivery` da API (mensagem genérica “Assinante criado”).

## Alterações no código

- `apps/api/src/mail/tenant-welcome-delivery.ts` — envio centralizado + mensagem clara se SMTP ausente.
- `apps/api/src/tenants/tenant.routes.ts` — `POST /api/master/tenants/:id/resend-welcome` (body: `initialPassword`).
- `apps/api/src/server.ts` — `/health` com `smtpConfigured` e `mailMode`.
- `apps/admin/src/App.tsx` — feedback `emailDelivery` ao criar assinante.
- `apps/api/src/deploy-marker.ts` — `DEPLOY-2026-06-04-smtp-health-resend-welcome`.

## Próximos passos operacionais

1. Easypanel → serviço **api** (não Typebot): variáveis SMTP listadas em `doc/EASYPANEL-AMBIENTE.env.example`.
2. Redeploy + scale 0→1 se marker antigo.
3. `GET /health` → `smtpConfigured: true`.
4. Reenviar: `POST /api/master/tenants/1f992ff8-741b-451d-b3c8-bb08ec1ba92a/resend-welcome` com senha inicial.
5. Verificar spam; Gmail pode atrasar alguns minutos.

## Pendências

- Deploy marker novo em produção.
- Commit/push se usuário solicitar.
