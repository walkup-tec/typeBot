# Fix estável — Traefik Easypanel (502 / LP Easypanel / Painel cai)

## Causa raiz

1. **DNS Swarm** (`typebot_paginadevendas`, `typebot_painel-typebot-crm`) resolve IP **morto** no Traefik.
2. **Traefik** não fica na rede `easypanel-typebot` após restart → timeout.
3. **`172.17.0.1:3000`** no host é o **Easypanel**, não a landing.
4. Easypanel **regenera** `main.yaml` em redeploys → URLs voltam ao padrão quebrado.

## Destinos corretos

| Domínio | Backend |
|---------|---------|
| `app.chattypebot.com` | `http://172.17.0.1:3333` (API com porta publicada) |
| `chattypebot.com` | `http://<IP-LP-na-rede-easypanel-typebot>:3000/` |
| `painel.chattypebot.com` | `http://<IP-painel-na-rede-easypanel-typebot>:3000/` |
| `typebot-typebot-walkup-builder.achpyp.easypanel.host` | `http://<IP-builder>:3000/` ou hostname na rede `easypanel-typebot` |
| `typebot-typebot-walkup-viewer.achpyp.easypanel.host` | `http://<IP-viewer>:3000/` |

## Solução permanente (recomendado)

Ver **[TRAEFIK-PERMANENTE-VPS.md](TRAEFIK-PERMANENTE-VPS.md)** — instala cron + rede Swarm no Traefik.

```bash
chmod +x /root/traefik-permanent-vps.sh
/root/traefik-permanent-vps.sh install
```

## Script legado (só correção pontual)

```bash
chmod +x /root/fix-traefik-easypanel-502.sh
/root/fix-traefik-easypanel-502.sh
```

## Após redeploy Easypanel

Com `/root/traefik-permanent-vps.sh install` (uma vez): **automático** — watcher + timer 20s. **Não** é necessário SSH após cada deploy. Ver `doc/DEPLOY-SEM-502-PAINEL.md`.

## Fix manual rápido (painel caiu)

```bash
LP_IP=$(docker inspect $(docker ps -q -f name=paginadevendas | head -1) --format '{{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}')
PAINEL_IP=$(docker inspect $(docker ps -q -f name=painel-typebot-crm | head -1) --format '{{index .NetworkSettings.Networks "easypanel-typebot" "IPAddress"}}')
CFG=/etc/easypanel/traefik/config/main.yaml
sed -i "s|http://typebot_paginadevendas:3000/|http://${LP_IP}:3000/|g" "$CFG"
sed -i "s|http://typebot_painel-typebot-crm:3000/|http://${PAINEL_IP}:3000/|g" "$CFG"
sed -i 's|http://typebot_api[^"]*|http://172.17.0.1:3333|g' "$CFG"
for net in $(docker network ls --format '{{.Name}}' | grep -E 'easypanel|typebot'); do docker network connect "$net" $(docker ps -q -f name=traefik) 2>/dev/null; done
docker restart $(docker ps -q -f name=traefik)
```
