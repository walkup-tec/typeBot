# Snapshot — toast verde para sucesso, vermelho só para erro

**Data:** 2026-06-02

## Sintoma
- "Lista atualizada: 5 fluxo(s) na matriz." aparecia em **vermelho**.

## Causa
1. Regex de sucesso usava `atualizado` — não casava `atualizada`.
2. Fallback padrão era sempre `error` (vermelho).
3. CSS base `.status-toast` era vermelho mesmo sem classe de tom.

## Correção
- `apps/admin/src/lib/resolveStatusToastTone.ts` — classifica `success` | `error` | `info`.
- `App.tsx` — usa o helper centralizado.
- `styles.css` — base neutra; `.success` verde; `.error` vermelho; `.info` neutro.

## Deploy
- Redeploy serviço **painel** (build admin).
