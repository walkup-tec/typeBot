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
node scripts/easypanel-deploy-empty.cjs "api-typebot-crm: descrever a mudança em uma linha"
```

No Windows PowerShell podes definir o serviço (aparece no commit):

```powershell
$env:EASYPANEL_SERVICE="api-typebot-crm"
node scripts/easypanel-deploy-empty.cjs "fix flow-library + sync auth"
```

Isto faz:

1. `git commit --allow-empty -m "deploy[api-typebot-crm]: … | ISO8601 | shortsha"`
2. `git push`

O próximo build no Easypanel passa a mostrar **essa** mensagem como identificador do deploy.

## Boas práticas

- **Um commit real** por alteração (`feat:`, `fix:`, `chore:`) com mensagem curta e única — já melhora o histórico.
- Para **só reenviar** o mesmo código ao FTP/Easypanel: usa o script acima em vez de repetir “redeploy” sem texto.
- Evita depender de títulos genéricos gerados por ferramentas; o que importa para rastreio é o **teu** prefixo + serviço + descrição.

## NPM

Na raiz do monorepo:

```bash
npm run easypanel:deploy-empty -- "descrição curta do que vai ao ar"
```
