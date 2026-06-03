# Drax — padrão inativo + fluxo workspace ausente

## Solicitação

1. Fluxo master (padrão) aparece no assinante como **Inativo**.
2. Fluxo criado no workspace Typebot do Drax **não aparece** na etapa 6.

## Causa

1. Status via `attachFlowActiveStatus` não casava padrão (`librarySourceId`) com bot do workspace por título/publicId da matriz.
2. `quick=1` não importava bots manuais do workspace; prune apagava fluxos com `typebotRemoteId` fora do snapshot da API.
3. `flowAlreadyLinked` bloqueava import quando só existia registro padrão sem `typebotRemoteId`.
4. Painel misturava padrão e workspace na mesma tabela.

## Alterações

- `typebot-flow-publish-status.ts` — match por título da biblioteca; ativo se bot existe no workspace.
- `typebot-flow-viewer-url-sync.ts` — listagem workspace resiliente; prune conservador; import não bloqueado por padrão.
- `subscriber-default-flows.service.ts` — quick importa workspace + refresh URLs.
- `App.tsx` — workspace só fluxos sem `librarySourceId`.
- Marker: `DEPLOY-2026-06-04-walkup-drax-fluxos-ativo-workspace`.

## Validação

- `npm run build:api` OK.

## Pendências

Redeploy api + painel; Drax etapa 6 → Atualizar lista.
