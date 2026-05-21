# LOG 2026-05-20 — pill status + salvar nome lead

## Solicitações abertas
- Padding do badge "Em atendimento" (muito colado em cima/baixo).
- Nome do lead no detalhamento: alterar + "Salvar alterações" voltava ao nome original.

## Alterações
- `apps/admin/src/styles.css` — mais padding vertical no `.live-inbox-status-pill`.
- `apps/api/src/lib/lead-contact-name.ts` — `contactNameOverride`, prioridade de resolução, merge em todas chaves nome contato/completo.
- `apps/admin/src/leadContactData.ts` — mesma lógica de prioridade no admin.
- `apps/api/src/queue/queue.routes.ts` — `resolveLeadContactNameDisplay`, ordem save (dados antes da nota), `notifyParentQueueUpdated` após salvar profile.

## Validação
- `npm run build:api` — OK.
- `npm run build:admin` — falhou ambiente local (`@vitejs/plugin-react` ausente); não relacionado ao diff.

## Deploy
- Rebuild **api-typebot-crm** + **painel-typebot-crm** após push.

## Retomada
- Testar: editar nome no drawer → Salvar alterações (com e sem texto em observações).
- Confirmar lista da Fila ao vivo atualiza o nome após salvar.
