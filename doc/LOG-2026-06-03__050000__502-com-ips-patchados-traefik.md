# LOG 2026-06-03 — 502 com IPs patchados (Traefik)

## Saída VPS (usuário)
```
IPs: LP=10.0.4.210 PAINEL=10.0.4.126 BUILDER=10.0.4.200 VIEWER=10.0.4.203 MINIO=10.0.4.72
RESULTADO lp:502 painel:502 app:200 builder_signin:502
```
- main.yaml foi alterado (builder url LP -> builder, minio, viewer)
- diagnose local ausente: `scripts/diagnose-502-lp-painel-vps.sh: No such file`

## Interpretação
- Containers com IP na rede overlay → script patchou YAML
- 502 persiste → Traefik não alcança upstream OU rota/router errado OU app não responde :3000
- API OK (172.17.0.1:3333) — problema isolado LP/painel/builder

## Próximo passo
- Rodar diagnose via curl raw GitHub no VPS
- wget interno Traefik → LP/painel/builder IPs
