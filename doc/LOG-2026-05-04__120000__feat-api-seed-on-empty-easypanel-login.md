# LOG: seed no arranque quando base JSON vazia (login após deploy)

## Contexto

Após cada redeploy no Easypanel/Docker sem **volume persistente** em `apps/api/data`, os ficheiros `tenants.json` / `attendants.json` voltam vazios → **401 no login** e **404 no reset** (“e-mail não encontrado”). Isto não é falha intermitente de auth: é **perda de dados no disco do contentor**.

## Solução implementada

1. **Recomendação explícita** em `doc/EASYPANEL-AMBIENTE.env.example`: montar volume no caminho onde a API grava (`apps/api/data`; em runtime compilado, `getDataFilePath` resolve a partir de `dist/lib` → `apps/api/data`).

2. **Bootstrap opcional** `seedTenantOnEmptyIfConfigured()` em `apps/api/src/bootstrap/seed-tenant-on-empty.ts`, chamado em `server.ts` antes de `app.listen`:
   - Só corre se `API_SEED_ON_EMPTY=true`.
   - Só corre se **não existir nenhum tenant** e **nenhum attendant** (base totalmente vazia).
   - Cria assinante + master via `TenantService.create` com:
     - `API_SEED_OWNER_EMAIL`
     - `API_SEED_OWNER_PASSWORD` (mín. 4 caracteres, alinhado ao schema)
     - `API_SEED_TENANT_NAME` (opcional, default “Assinante”, mín. 2 caracteres)
     - `API_SEED_WHATSAPP` (opcional, default `5500000000000` se inválido)

3. **`AttendantRepository.countAll()`** para contagem após `reloadFromDisk()`.

## Ficheiros alterados

- `apps/api/src/bootstrap/seed-tenant-on-empty.ts` (novo)
- `apps/api/src/server.ts`
- `apps/api/src/attendants/attendant.repository.ts`
- `doc/EASYPANEL-AMBIENTE.env.example`

## Como validar

1. Local: apagar conteúdo de `apps/api/data/tenants.json` e `attendants.json` para `[]`, definir env de seed, arrancar API → deve criar um tenant e login com o e-mail/senha definidos.
2. Produção: **preferir volume**; seed só como rede de segurança.

## Segurança

- Não commitar senhas reais; usar secrets do Easypanel.
- Com `API_SEED_ON_EMPTY=true`, quem tiver acesso ao ambiente vê a senha inicial — trocar após primeiro login ou usar só em bootstrap controlado.

## Palavras-chave

`API_SEED_ON_EMPTY`, `apps/api/data`, volume Easypanel, login 401 após deploy, `seed-tenant-on-empty`
