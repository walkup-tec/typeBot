# LOG 2026-05-20 — Fila ao vivo: chat único (embed inbox)

## Pedido
Layout como referência: um chat só, ícones no canto superior direito (anexos, observações, lead) — sem “chat dentro de chat”.

## Causa
- Painel tinha header próprio + iframe com handoff-view (segundo header + card 500px centralizado).
- CSS `.agent-widget { width:min(500px); margin:20px auto; border... }` dentro do iframe.

## Correção
- `embed=inbox` em `buildHandoffAgentViewUrl`; CSS full-bleed no handoff agente.
- Removido header duplicado em `LiveInboxScreen`; iframe 100% do painel.
- Subtítulo no embed: `fluxo · nome do assinante`.
- Ícones permanecem no handoff-view (comportamento anterior).

## Arquivos
- `apps/admin/src/LiveInboxScreen.tsx`, `App.tsx`, `styles.css`
- `apps/api/src/queue/queue.routes.ts`

## Deploy
- **api-typebot-crm** + **painel-typebot-crm**
