# LOG 2026-05-20 — upload PDF/Word no detalhe do lead

## Problema
Anexos de imagem OK; PDF/Word falhavam no envio.

## Causa
Limite de 260–300 KB (base64) aplicado igualmente a documentos.

## Correção
- Documentos: até 4 MB (arquivo) / 6 MB (payload base64).
- Imagens: compressão mantida (~280 KB).
- MIME inferido por extensão; erros mais claros no drawer.

## Arquivos
`lead-attachment-limits.ts`, `queue.service.ts`, `queue.routes.ts`, `WidgetApp.tsx`

## Deploy
Rebuild api-typebot-crm.
