# Snapshot — atendentes Soma sem e-mail boas-vindas

**Data:** 2026-06-04

## Caso

Master assinante `somaconecta@gmail.com` criou atendentes:
- `mozart.hotmart@gmail.com` (login `Vendedor 01`, Mozart)
- `digitlcorban@gmail.com` (login `Vendedor 02`, Ana)

Nenhum recebeu e-mail.

## Diagnóstico produção

- `/health`: `smtpConfigured: true`, `mailMode: smtp`, marker `DEPLOY-2026-06-04-smtp-health-resend-welcome`
- Atendentes persistidos no tenant Soma (`1f992ff8-741b-451d-b3c8-bb08ec1ba92a`)
- Criação ~17:55 UTC — provável janela em que SMTP acabou de subir ou toast de auto-save não foi visto
- Login dos atendentes usa **nome usuário** (`Vendedor 01` / `Vendedor 02`), não o e-mail

## Correção código

- `attendant-welcome-delivery.ts` + refactor `attendant.routes.ts`
- `POST .../attendants/:id/resend-welcome` (senha + sync hash)
- Admin Master Console etapa 2: botão **Reenviar e-mail** por atendente
- Mensagens de cadastro citam e-mail destino + usuário de login
- Marker: `DEPLOY-2026-06-04-attendant-resend-welcome`

## Deploy

API + painel admin. Reenviar manualmente para Mozart e Ana após deploy.
