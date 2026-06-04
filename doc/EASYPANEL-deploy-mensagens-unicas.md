# Easypanel — título do deploy repetido

## Por que acontece

Quando o serviço no Easypanel usa **fonte Git** (webhook ou “deploy on push”), o painel mostra o **assunto do último commit** da branch (muitas vezes prefixado com `Deploy service:`). Se:

- fizeres **redeploy** sem novo commit no Git, ou  
- o mesmo commit for disparado duas vezes,

o **título fica igual** — não é bug do código da app, é o histórico do Git sem um novo SHA/mensagem.

Mensagens longas com `Co-authored-by: Cursor` também ocupam o mesmo espaço visual e parecem “iguais” entre si.

## O que fazer (recomendado)

Antes de quereres que o Easypanel mostre **outro nome** de deploy, cria um commit **vazio** só para marcar o deploy, com texto explícito:

```bash
cd /caminho/para/typebot-Saas
node scripts/easypanel-deploy-empty.cjs "api: descrever a mudança em uma linha"
```

No Windows PowerShell podes definir o serviço (aparece no commit):

```powershell
$env:EASYPANEL_SERVICE="api"
node scripts/easypanel-deploy-empty.cjs "fix flow-library + sync auth"
```

Isto faz:

1. `git commit --allow-empty -m "deploy[api]: … | ISO8601 | shortsha"`
2. `git push`

O próximo build no Easypanel passa a mostrar **essa** mensagem como identificador do deploy.

## SHA no título (regra global Cursor)

O Easypanel **não** mostra o hash Git à parte — só o **assunto do commit**. Se a mensagem for só `fix: texto…` (como em deploys automáticos sem SHA), o painel fica sem referência `ee2ce32`.

**Commits com código** (recomendado):

```bash
npm run easypanel:commit -- "fix: hostAvatar soma-minio → typebot-minio"
# Assunto final: [ee2ce32] fix: hostAvatar soma-minio → typebot-minio
git push
```

Script: `scripts/git-commit-easypanel.cjs` (amend após commit para prefixar `[shortsha]`).

## Boas práticas

- **Um commit real** por alteração com `[shortsha]` no assunto (via `easypanel:commit`).
- Para **só reenviar** o mesmo código: `npm run easypanel:deploy-empty -- "api: motivo"`.
- Evita `Co-authored-by:` no assunto — ocupa o título do deploy no Easypanel.

## NPM

Na raiz do monorepo:

```bash
npm run easypanel:deploy-empty -- "descrição curta do que vai ao ar"
```
