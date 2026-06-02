# Deploy 2026-06-01 — Biblioteca matriz + Pix LP

## Commits no GitHub (`walkup-tec/typeBot` branch `master`)

| Commit | Marcador | Serviço Easypanel |
|--------|----------|-------------------|
| `eed34f3` | `DEPLOY-2026-06-01-api-biblioteca-v7` | **`api`** |
| `c518e51` | `DEPLOY-2026-06-01-admin-biblioteca` | **`painel-typebot-crm`** (ou painel com admin) |
| `fc90b54` | sales/traefik (monorepo) | opcional se LP = repo PV |

## Landing (`walkup-tec/PV-typebot-chat` branch `main`)

| Commit | Marcador | Serviço |
|--------|----------|---------|
| `6344cd9` | `DEPLOY-2026-06-01-lp-pix-ssr-off` | **`paginadevendas`** |
| `50b4894` | `DEPLOY-2026-06-01-lp-pix-pagamento` | (incluído se já implantou 6344cd9) |

## Ordem de deploy

1. **`api`** → Implantar → `curl -s https://app.chattypebot.com/health | grep biblioteca-v7`
2. **Painel** → Implantar → login `walkup@walkuptec.com.br` → Biblioteca Master → Atualizar lista
3. **`paginadevendas`** → Implantar commit `6344cd9` (se ainda não)
4. VPS: `bash /root/fix-traefik-easypanel-502.sh`
5. Se LP 502: fix manual `typebot_paginadevendas-1` → IP do container (já documentado em LOG-211500)

## Validar biblioteca

- Biblioteca Master: bloco **Fluxos ativos no workspace matriz**
- Etapa 6 (conta matriz): **Fluxos ativos na biblioteca** + workspace
