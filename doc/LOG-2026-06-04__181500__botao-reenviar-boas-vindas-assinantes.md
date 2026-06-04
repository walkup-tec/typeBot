# Snapshot — botão reenviar boas-vindas (Assinantes)

**Data:** 2026-06-04

## Alterações

- **Admin** (`App.tsx`): botão "Reenviar e-mail" na tabela Assinantes (exceto Master do Sistema); modal com senha; feedback `emailDelivery`.
- **API** (`tenant.routes.ts`): reenvio atualiza `passwordHash` do master do assinante antes do SMTP.
- **CSS**: `subscriber-actions` com `flex-wrap`.
- **Marker**: `DEPLOY-2026-06-04-resend-welcome-ui`.

## Deploy

1. Serviço **api** (endpoint resend + senha)
2. Serviço **painel/admin** (botão na UI)

Validar marker em `/health` e testar em Assinantes → Soma Promotora → Reenviar e-mail.
