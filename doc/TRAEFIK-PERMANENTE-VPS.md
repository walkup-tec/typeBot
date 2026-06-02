# Traefik permanente no VPS (fim do 502 recorrente)

## Por que a LP cai

No Easypanel + Docker Swarm:

1. Cada **redeploy** troca o IP do container na rede `easypanel-typebot`.
2. O `main.yaml` do Traefik fica com **IP antigo** ou hostname Swarm que resolve para IP morto (`10.11.x`).
3. O Traefik às vezes **não está** na rede `easypanel-typebot` após restart.
4. Comandos `sed` genéricos em `10.0.4.*:3000` **quebram LP e painel** (apontam tudo para o Typebot).

Isso **não é bug da aplicação** — é drift de rede Swarm + proxy estático.

## Solução permanente (obrigatória no VPS)

Script: [`scripts/traefik-permanent-vps.sh`](../scripts/traefik-permanent-vps.sh)

```bash
# 1) Copiar script para o servidor (repo local ou após push no GitHub)
cp scripts/traefik-permanent-vps.sh /root/
chmod +x /root/traefik-permanent-vps.sh

# 2) Instalar (cron 2 min + rede Swarm no Traefik + correção imediata)
/root/traefik-permanent-vps.sh install
```

O que o `install` faz:

| Ação | Efeito |
|------|--------|
| `docker service update --network-add easypanel-typebot` no Traefik | Traefik **sempre** na rede dos apps |
| Cron `/etc/cron.d/traefik-permanent-fix` | A cada **2 min** atualiza IPs no `main.yaml` |
| **Sem** restart Traefik na rotina | Evita queda a cada correção |
| Restart Traefik | **Só** se LP ainda 502 após patch |
| Detecta LP com tela Typebot "Entrar" | Reaplica upstream da LP |

## Verificação

```bash
/root/traefik-permanent-vps.sh run
# Esperado: RESULTADO lp:200 ou lp:307 painel:200 ou painel:307 app:200
tail -20 /var/log/traefik-permanent-fix.log
```

## Após redeploy no Easypanel

**Não precisa** SSH manual — no máximo **2 minutos** o cron corrige.

Opcional: rodar na hora:

```bash
/root/traefik-permanent-vps.sh run
```

## O que NUNCA fazer

```bash
# PROIBIDO — aponta LP/painel para Typebot
sed -i 's|http://10.0.4.[0-9]*:3000|http://BUILDER_IP:3000|g' main.yaml
```

## Scripts relacionados

| Script | Uso |
|--------|-----|
| `traefik-permanent-vps.sh` | **Instalação permanente** (use este) |
| `fix-traefik-easypanel-502.sh` | Legado — mesmo patch, sem install |
| `monitor-traefik-proxy.sh` | E-mail diário + dispara fix se falhar |
