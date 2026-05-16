# Snapshot — histórico da sessão (chat Cursor): deploy API Easypanel

**Data:** 2026-05-14  
**Objetivo do utilizador:** Corrigir falhas de build Nixpacks (`npm ci`), consolidar estado do repo e registar o fio para retomada futura.

---

## Pedidos cobertos neste chat

1. Análise dos logs Easypanel (`npm ci` EUSAGE, pacotes em falta `@typebot-saas/sales`, Node 18 vs stack Vite 7 / TanStack).
2. Implementação no repo: alinhar `workspaces`, regenerar `package-lock.json`, `nixpacks.toml`, scripts sales por workspace.
3. Commit local `fix(ci)` sem incluir alterações não relacionadas.
4. Segunda rodada de erro: mesmo sintoma → diagnóstico `GIT_SHA=a1359a5` (commit admin **sem** fix ci no remoto).
5. `.nvmrc` + `engines.node` `22.x`, push `master`, atualização memória.
6. Pedido final: atualizar tudo + gravar este chat no histórico do projeto.

---

## Decisões técnicas

- Tratar **`apps/sales`** como workspace npm na raiz (`apps/*`), coerente com o lock existente.
- Forçar **Node 22** no Nixpacks: `nixpacks.toml`, `.nvmrc`, `engines.node` em formato major (`22.x`).
- Não versionar nesta linha de trabalho: alterações soltas locais (`.env`, billing, backups, etc.).

---

## Commits relevantes (ordem)

| SHA (curto) | Mensagem |
|-------------|----------|
| `d3fb934` | `fix(ci): alinhar workspaces com lock e Nixpacks Node 22` |
| `33f7a09` | `chore(ci): .nvmrc 22 e engines 22.x para Nixpacks` |
| `6d29388` | `docs(memoria): push master e SHA deploy Easypanel` |

**Remoto após push:** `origin/master` deve apontar para `6d29388` ou posterior.

---

## Comandos executados (resumo)

- `npm install` / `npm ci` na raiz (sessão anterior) — validação local.
- `npm run build:api` — OK após install.
- `git push origin master` (dois pushes: fix+chore; depois memória).
- Neste pedido: `git fetch`, `git pull --ff-only origin master` → **Already up to date.**

---

## Validações

- Build local da API OK após correção de dependências.
- Erro Easypanel **antes** do push era esperado (código fix ci ausente no GitHub).

---

## Pendências

- **Redeploy** do serviço `api-typebot-crm` (ou equivalente) no Easypanel; confirmar no log `GIT_SHA` ≥ `6d29388` e `setup` com **nodejs_22** (ou variável equivalente).
- **Rotação de credenciais** se os logs de build com secrets foram expostos (JWT, DATABASE_URL, tokens, passwords).
- Workspace local continua com muitos ficheiros modificados/untracked **fora** desta linha — não misturados nos commits ci.

---

## Nota sobre “histórico do chat”

O histórico conversacional completo do Cursor fica nos **transcripts** da aplicação (fora deste repo). Este ficheiro + `doc/memoria.md` servem de **histórico de projeto** para equipa e para retomar contexto técnico.
