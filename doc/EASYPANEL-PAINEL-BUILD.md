# Easypanel — build correto do painel (`painel-typebot-crm`)

## Sintoma

Deploy/redeploy no Easypanel, mas `https://painel.chattypebot.com` continua com:

- Título `Typebot SaaS Admin`
- Bundle antigo (`index-BhODyx1E.js`)
- Favicon Typebot ou ausente

## Causas comuns

1. **Traefik** apontando para container/IP **antigo** (rede Swarm) — rode `/root/traefik-permanent-vps.sh run`
2. **Build errado**: serviço usa `nixpacks.toml` da **raiz** (só API) em vez de `build:admin`
3. **Repo/branch** errados no Easypanel
4. Build **falhou** e o Easypanel manteve o container anterior

## Configuração recomendada (Easypanel → painel-typebot-crm)

| Campo | Valor |
|--------|--------|
| Repositório | `walkup-tec/typeBot` |
| Branch | `master` |
| Root Directory | *(vazio = raiz do repo)* |

**Build command:**

```bash
npm ci && npm run build:admin
```

**Start command:**

```bash
npm run start:admin
```

**Porta:** `3000`

**Env no BUILD** (não só runtime): ver `doc/EASYPANEL-PAINEL-VITE-build.env.example`

## Validar após deploy

1. HTML do painel deve ter `Drax — Painel de atendimento` e links `/favcon.png`
2. Hash do JS **diferente** de `index-BhODyx1E.js`
3. `curl -sI https://painel.chattypebot.com/favicon.ico` → `Content-Type: image/png` ou `image/x-icon` (não `text/html`)

## Hotfix imediato (SSH)

```bash
curl -fsSL "https://raw.githubusercontent.com/walkup-tec/typeBot/master/scripts/fix-painel-favicon-hotfix-vps.sh" -o /root/fix-painel-favicon-hotfix-vps.sh
chmod +x /root/fix-painel-favicon-hotfix-vps.sh
/root/fix-painel-favicon-hotfix-vps.sh
```
