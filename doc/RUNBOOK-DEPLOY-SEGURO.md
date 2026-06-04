# Runbook de Deploy Seguro

## Objetivo

Evitar regressao e perda de dados em deploy de API/Painel.

## Pre-requisitos

- Ambiente com PowerShell.
- API alvo acessivel.
- `apps/api/data` persistente em volume **ou** estrategia de backup.

## 1) Backup pre-deploy

No root do projeto:

```powershell
npm run backup:predeploy
```

O comando cria snapshot em `backups/predeploy-YYYYMMDD-HHMMSS`.

**Produção:** antes de deploy, confirme em `GET /health` os campos `operationalDataDirectory` e `flowsSavedCount` e que o volume Easypanel cobre essa pasta (ver `doc/EASYPANEL-VOLUME-FLUXOS-FILA.md`).

## 2) Deploy

Fazer deploy normal no ambiente (API e, quando houver mudanca de front, painel/widget).

**Painel/LP (producao):** no VPS, rode **uma vez** `/root/traefik-permanent-vps.sh install` (`doc/DEPLOY-SEM-502-PAINEL.md`). Redeploys seguintes sao automaticos (watcher + timer 20s).

## 3) Smoke test obrigatorio pos-deploy

```powershell
npm run smoke:prod -- `
  -ApiBaseUrl "https://SEU_HOST_API" `
  -TenantId "TENANT_ID" `
  -FlowPublicId "PUBLIC_ID_DO_FLUXO" `
  -ExpectedFlowLabel "Nome Esperado do Fluxo"
```

Validacoes executadas:

- Biblioteca do tenant contem o fluxo.
- `POST /api/typebot/handoff` retorna `contactId`.
- Contato entra na fila com `sourceFlowLabel`.
- Assign muda status para `in_service`.
- Sessao de mensagens retorna historico.

## 4) Rollback (se smoke falhar)

```powershell
npm run rollback:data -- -SnapshotPath "backups/predeploy-YYYYMMDD-HHMMSS"
```

## Politica obrigatoria

- Sem backup: **nao deployar**.
- Sem smoke verde: **nao considerar deploy concluido**.
- Em falha: rollback imediato + investigacao antes de novo deploy.
