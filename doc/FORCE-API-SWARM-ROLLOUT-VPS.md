# Forçar task API após deploy Easypanel (VPS)

## Problema

Deploy **Success** no Easypanel, mas `https://app.chattypebot.com/health` mantém `deployMarker` antigo.

**Causa:** Docker Swarm — porta **3333** publicada em **host-mode**. A task antiga não libera a porta; a nova fica **Pending** (`host-mode port already in use`).

## Comando único (após cada deploy da API)

No console **root** do VPS:

```bash
curl -fsSL "https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/force-api-swarm-rollout-vps.sh" \
  -o /root/force-api-swarm-rollout-vps.sh
chmod +x /root/force-api-swarm-rollout-vps.sh
/root/force-api-swarm-rollout-vps.sh auto
```

Com marker esperado (opcional):

```bash
EXPECTED_MARKER='DEPLOY-2026-06-05-soma-dedupe-title-fix-v3' /root/force-api-swarm-rollout-vps.sh auto
```

Só diagnóstico:

```bash
/root/force-api-swarm-rollout-vps.sh diagnose
```

## O que o script faz

1. Localiza o serviço Swarm `typebot_api`
2. Se houver Pending na 3333 **ou** marker diferente do esperado → `scale 0` → aguarda → `scale 1`
3. Valida `/health`
4. Se 502, chama `/root/traefik-permanent-vps.sh run` (se existir)

## Automático (opcional)

Se `traefik-permanent-vps.sh install` já estiver ativo, copie também o script para `/root/` — cada ciclo do watcher chama `force-api-swarm-rollout-vps.sh auto` antes do patch Traefik.

## Fix definitivo (sem scale 0/1)

No Easypanel, serviço **api**: **remover** publicação da porta **3333** no host (igual feito no painel). Traefik passa a usar rede overlay (`typebot_api:3333` ou IP da task — `traefik-permanent-vps.sh`).
