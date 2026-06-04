# Snapshot — commit SMTP boas-vindas na criação

**Data:** 2026-06-04

## Pedido

Enviar e-mail automaticamente ao criar assinante/atendente; commit para deploy Easypanel; forçar container a carregar env SMTP.

## Commit (escopo)

- `tenant-welcome-delivery.ts` — envio centralizado na criação do assinante
- `tenant.routes.ts` — `POST /api/master/tenants/:id/resend-welcome`
- `server.ts` — `/health` com `smtpConfigured`, log no boot
- `deploy-marker.ts` — `DEPLOY-2026-06-04-smtp-health-resend-welcome`
- `App.tsx` — feedback `emailDelivery` ao criar assinante

## Deploy

1. Push `master` → Easypanel serviço `api` → Implantar
2. Validar: `GET https://app.chattypebot.com/health` → `smtpConfigured: true`, marker novo
3. Se marker antigo: `docker service scale typebot_api=0` → aguardar → `=1`
4. Reenviar Soma: `POST .../tenants/1f992ff8-741b-451d-b3c8-bb08ec1ba92a/resend-welcome` + `initialPassword`

## SSH

Sem credenciais nesta sessão; operador pode rodar scale no Swarm após pull da imagem.
