## 2026-05-13 - Pedido: tudo local; deploy só pelo utilizador

- Repo: `apps/sales` com `start` + `nixpacks.toml` `[start]` prontos para Easypanel.
- Build **nesta máquina**: `npm ci` em `apps/sales` falhou com **EPERM** (Windows: ficheiros em uso / antivírus). Sem Docker local para simular Linux; o **build no Easypanel** (Nixpacks Linux) é o validador.
- **Utilizador:** `git push` + redeploy do serviço da LP; após fechar processos que lockem `node_modules`, pode correr `npm ci --include=dev` e `npm run build` em `apps/sales` para validar em Windows.

## 2026-05-13 - LP fora do ar: Easypanel "Service is not reachable" + hardening start

- Causa típica: proxy sem upstream (contentor parado, crash no boot, ou comando/porta errados).
- `apps/sales/package.json`: script `start` igual ao servidor estático (muitos Paais chamam `npm start` por defeito; antes só existia `start:static`).
- `apps/sales/nixpacks.toml`: `[start] cmd = "npm run start:static"`.
- **Easypanel:** ver logs do serviço; confirmar **porta interna** = `PORT` (ex. 3000); comando de arranque não pode ser só `vite dev` em produção; redeploy após push.
- **SSL "Não seguro":** emitir/renovar TLS no domínio no Easypanel após o serviço voltar a responder.

## 2026-05-13 - Utilizador: ambiente configurado e deploy concluído

- Confirmação: env + deploy em produção (API + landing conforme conversa anterior).
- Próximo (opcional): teste checkout sandbox + webhook Asaas na API.

## 2026-05-13 - Segurança: chaves Asaas removidas de `apps/sales/.env.example`

- Ficheiro de exemplo da landing continha **API keys reais** (sandbox + produção) e Wallet ID — **não** devem estar em ficheiros versionados; a landing **não** usa `ASAAS_*` (só a API em `apps/api`).
- `.env.example` limpo: placeholders comentados + aviso para Easypanel/API e rotação se vazamento.
- **Ação do utilizador:** se este conteúdo chegou ao Git remoto ou foi partilhado, **revogar/regenerar** chaves no Asaas e configurar `ASAAS_API_KEY` (e URL) apenas no ambiente do **serviço da API**.

## 2026-05-13 - Deploy Easypanel vendas: ERR_MODULE_NOT_FOUND @lovable.dev/vite-tanstack-config

- Causa: build-arg `NODE_ENV=production` → `npm ci` **sem** devDependencies; o `vite.config.ts` importa `@lovable.dev/vite-tanstack-config` (estava em devDeps).
- Correção: `nixpacks.toml` com `[phases.install] cmds = ["npm ci --include=dev"]` em `apps/sales` e `_pv-typebot-chat-temp`; `@lovable.dev/vite-tanstack-config` mantido em **dependencies** no `package.json` (cinto e suspensórios). PV commit `f3451d4`.

## 2026-05-13 - Landing: máscara CPF/CNPJ + nota DNS checkout

- `maskCpfCnpj.ts` + campo no modal Assinar; envio só dígitos; validação 11 ou 14 dígitos antes do POST.
- `ERR_NAME_NOT_RESOLVED` em `api.chattypebot.com`: DNS público inexistente — criar A/AAAA ou usar no build o host HTTPS real da API (Easypanel).
- `.env.example`: secção DNS. `PV-typebot-chat` `365cd90`.

## 2026-05-13 - apps/sales: .env.example completo + .env.local.example

- `.env.example`: secções [BUILD] Vite, [RUNTIME] Node, local comentado, ponteiro para API (`doc/EASYPANEL-AMBIENTE.env.example`).
- `.env.local.example`: template para `vite dev` (copiar para `.env.local`).
- `.env.production`: nota sobre PORT/HOST.
- `_pv-typebot-chat-temp/.env.example` alinhado.

## 2026-05-13 - Env landing: VITE_API_BASE_URL / VITE_PAINEL_URL documentados

- Valores de produção do projeto: `https://api.chattypebot.com`, `https://painel.chattypebot.com` (doc DEPLOY-VPS). Comentários em `apps/sales/.env.production`, `.env.example` e `_pv-typebot-chat-temp/.env.production`; lembrete Easypanel se o build não ler o ficheiro.

## 2026-05-13 - Landing: erro “Failed to fetch” no checkout — mensagem e causa

- `createSalesSubscription` em `salesApi.ts`: `fetch` em try/catch com mensagem em PT citando `VITE_API_BASE_URL`, HTTPS e API no ar; parse com `text` + `JSON.parse` para evitar falha opaca.
- Causa típica: build da landing sem URL da API ou com `localhost`; ou API inacessível/CORS (menos provável com `cors({origin:true})`).
- `PV-typebot-chat` `8d0ce29`; `apps/sales` espelhado.

## 2026-05-13 - Landing: lista de tópicos do plano Business (duas colunas)

- Em vez de uma única `grid` com fluxo em “linhas” (o item curto da esquerda herdava a altura da linha do item longo da direita), passou a **duas listas** (`slice` ao meio) com `flex flex-col gap-2.5`, wrapper `grid sm:grid-cols-2 sm:items-start`, texto `leading-snug`.
- `PV-typebot-chat` `9a57521`; `apps/sales` espelhado.

## 2026-05-13 - Landing: toggle mensal/anual menos alto

- Trilho `h-7` (antes `h-9`), thumb `h-5 w-5`, `translate-x-[26px]` no estado anual para manter alinhamento na largura `52px`.
- `PV-typebot-chat` `60455e9`; `apps/sales` espelhado.

## 2026-05-13 - Landing: toggle mensal/anual (preços)

- Trilho `52px`, thumb `24px` com `left-[3px]` e `translate-x-[22px]` quando anual (sem sobreposição com “Anual”); `shrink-0`, `flex-wrap` e label/badge separados.
- Desativado: `bg-secondary` + `border-border` + sombra interna; thumb `bg-foreground` + anel para contraste no fundo escuro. Ativado: trilho `primary`, thumb `primary-foreground`.
- Badge “economize”: interpolação corrigida para `{`economize R$${savings.toFixed(0)}`}`.
- `PV-typebot-chat` `66700aa`; `apps/sales` + import `cn`.

## 2026-05-13 - Landing: secção Funcionalidades (experiência + sem Integrações)

- `FEATURES`: primeiro cartão "Excelente experiência" / "Seu Lead com um atendimento excepcional." (ícone `Sparkles`); removido cartão Integrações; import `Plug` removido.
- `BUSINESS_FEATURES` (pricing): alinhado — nova linha de experiência; removida linha de integrações.
- `PV-typebot-chat` commit `877c4a7`; espelho `apps/sales`.

## 2026-05-13 - Landing: ícone WhatsApp (gradiente Drax) no card Sobre

- Componente `WhatsAppBrandIcon` (SVG oficial + `linearGradient` com mesmas tonalidades de `--gradient-primary` em `styles.css`); card "Integração com WhatsApp" usa esse ícone em vez de `Phone` do Lucide.
- `PV-typebot-chat` commit `73ab5ce`; espelho em `apps/sales`.
- Build local do clone `_pv-typebot-chat-temp` falhou por pacote `@lovable.dev/vite-tanstack-config` ausente no ambiente (não relacionado ao diff).

## 2026-05-13 - Landing: copy "Como funciona" (time + passos 01/02)

- `PV-typebot-chat` / `apps/sales` `index.tsx`: título "Um time especializado para você" (gradient em `especializado`); subtítulo sobre setup/fluxos e qualidade 5 estrelas; passo 01 "Criamos seus fluxos" + texto especialistas; passo 02 mantém título "Publique no site" com novo texto de integração no site.
- Commit remoto: `13238d6`.
- Próximo: rebuild Easypanel.

## 2026-05-13 - Landing PV: cartão WhatsApp na secção "O que é o Drax"

- `_pv-typebot-chat-temp` / `walkup-tec/PV-typebot-chat`: quarto cartão na About — título "Integração com WhatsApp", texto sobre direcionar o final do atendimento para um número; ícone `Phone`; grelha `sm:grid-cols-2 xl:grid-cols-4`. Espelhado em `apps/sales/src/routes/index.tsx`.
- Commit remoto: `ffb0d33` (push `main`).
- Próximo: rebuild Easypanel do app de vendas/landing.

## 2026-05-12 - Lista de clientes: colunas e acao com lupa

- Colunas 5% mais estreitas; acao de detalhe com icone de lupa (mesma funcao).
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Fonte da lista de clientes 14px/15px

- Cabecalho da lista de clientes em 15px; corpo em 14px.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Menu lateral recolhido corrigido

- Logo e tagline ocultos no modo recolhido; topo mostra apenas o botao de expandir centralizado.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Fonte da lista de clientes ajustada

- Tabela da lista de clientes com fonte um pouco maior (13px no corpo, 12px no cabecalho).
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Inscricao do menu lateral em linha unica

- Texto "Type Bot e Chat de atendimento" ocupa toda a largura do menu em uma linha.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Tabela da lista de clientes mais suave

- Linhas sem contorno, alternancia leve de cor, fonte menor e espacamento reduzido.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Lista de clientes: CPF, nome duplicado e atendente

- CPF mascarado na coluna dedicada quando houver dado no lead.
- `Nome` e `Nome_Contato` iguais nao duplicam colunas extras; o nome principal fica na coluna Nome.
- Coluna Atendente usa nome humano (displayName) em vez de e-mail.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - CPF na lista de clientes do admin

- Coluna CPF exibida apos WhatsApp quando algum lead da lista tiver CPF em `leadContext`.
- Valor mascarado e busca por nome, WhatsApp ou CPF.
- Pendencia: redeploy do `painel-typebot-crm`.

## 2026-05-12 - Lista de clientes e menu lateral no admin

- Filtros e pesquisa da lista de clientes ficam na area visivel; WhatsApp passou a select compacto.
- Rolagem horizontal ficou restrita a tabela de clientes; menu lateral permanece fixo.
- Menu lateral com icones; recolher/expandir por icone no topo (preferencia em `localStorage`).
- Pendencia: redeploy do `painel-typebot-crm`.

- Removida a secao inferior "Dados do contato"; Nome, WhatsApp e CPF editam no topo com input, lapis discreto e copiar ao lado.
- Widget: `LeadInlineFactField.tsx`, `LeadDrawerPanel.tsx`, `WidgetApp.tsx` (`saveLeadContactFields` no blur; `saveProfile` reutiliza o mesmo fluxo).
- Handoff: HTML/CSS/JS em `queue.routes.ts` alinhados; listener antigo de copiar WhatsApp removido.
- Admin: modal da fila ao vivo com o mesmo padrao inline.
- Commit publicado: `1807c3b`.
- Validacao local: `npm run build:api`, `build:widget` e `build:admin` OK.
- Pendencia: redeploy Easypanel (`api-typebot-crm`, `widget-typebot-crm`, `painel-typebot-crm`) e hard refresh no browser.

## 2026-05-12 - Deploy producao sem alteracoes visiveis

- Causa: redeploy so do servico `api-typebot-crm` (`npm run build:api`); admin e widget sao servicos separados.
- Commit no ar era `07629bf` (fix CSS admin), mas o painel nao sobe nesse servico.
- CPF e demais ajustes estavam so no working tree local; commit `b130cb3` enviado ao GitHub.
- Proximo passo: redeploy `api-typebot-crm`, `painel-typebot-crm` e `widget-typebot-crm`; hard refresh no browser.

## 2026-05-12 - CPF fixo no detalhe do lead com edicao manual

- CPF aparece abaixo do WhatsApp no card do lead; sem valor mostra "Não informado".
- Atendente edita em Dados do contato; salva em `leadContext.CPF` via `PATCH /profile` (`leadCpf`).
- Variavel `CPF` do Typebot preenche automaticamente; chave fica fora da listagem duplicada de variaveis.
- Pendencia: redeploy API, widget e admin.

## 2026-05-12 - CPF oculto ate existir no leadContext

- Sem variavel CPF no Typebot/fila: UI nao exibe campo fixo nem coluna na lista de clientes.
- Quando `leadContext` trouxer chave de CPF/documento, o card volta a mostrar o valor mascarado.
- Pendencia: incluir CPF no fluxo Typebot e no webhook de handoff quando o produto exigir.

## 2026-05-12 - Retomada de sessao

- Contexto recuperado apos fechamento do Cursor; snapshot em `doc/LOG-2026-05-12__105956__recuperacao-retomada-typebot.md`.
- Ultimo commit publicado: `07629bf`; working tree com CPF mascarado, fallback `nome_completo`, lista de clientes e demais ajustes do painel lead ainda locais.
- `npm run build:api` OK nesta retomada.
- Proximo passo sugerido: build admin/widget, commit/push e redeploy Easypanel.

## 2026-05-12 - Painel admin sem estilos apos redeploy

- Causa: `LeadDetailModal` importava `widget.css` com regras globais de `button`/`input`/`body` e quebrava o layout do painel.
- Ajuste: estilos do modal de detalhe do lead ficam escopados em `apps/admin/src/styles.css`.
- Pendencia: redeploy do admin com build limpo e hard refresh.

## 2026-05-12 - Modal da fila com card de detalhamento do lead

- Fila ao vivo: icone do lead abre modal com o mesmo conteudo do card de detalhamento (contato, WhatsApp, atribuicao, Typebot, observacoes e anexos).
- Pendencia: redeploy do admin.

## 2026-05-12 - Modal do lead sem campos vazios na fila ao vivo

- Modal e fila ao vivo removem chaves sem valor util; API normaliza `leadContext` na leitura/gravacao.
- Pendencia: redeploy API e admin.

## 2026-05-12 - Salvar lead sem repetir assumir atendimento e rodape fixo

- Causa: salvar reatribuia o mesmo atendente e gerava mensagem de sistema no chat.
- Ajuste: atribuicao so quando o atendente muda; mensagem de assumir so na troca real; select sem pre-selecionar o atual; botao Salvar alteracoes fixo no rodape do card.
- Pendencia: redeploy API e widget.

## 2026-05-12 - Historico de observacoes do lead

- API: `agentNotesHistory` com `POST /api/chat/queue/:contactId/notes`; nota legada `agentNotes` vira entrada no historico.
- UI: registrar observacao e listar data/texto no painel (widget + handoff-view); "Salvar alteracoes" tambem grava observacao pendente.
- Pendencia: redeploy API e widget.

## 2026-05-12 - Chat centralizado com card do lead na margem direita

- Sintoma: ao abrir o card do lead, o chat deslocava para a direita.
- Ajuste: removida margem extra no chat com drawer aberto; painel lateral segue fixo na direita e o chat permanece centralizado (widget + handoff-view).
- Pendencia: redeploy API e widget.

## 2026-05-12 - Icones de anexos e observacoes no cabecalho do chat

- Cabecalho do atendente: icones de anexos e observacoes ao lado do contato; cor destaque quando ha registro.
- Clique abre o card lateral na secao correspondente (widget + handoff-view).
- Pendencia: redeploy API e widget.

## 2026-05-12 - Painel do lead ao lado do chat (sem bloquear digitacao)

- Sintoma: overlay do card do lead cobria o chat; atendente precisava fechar o painel para responder.
- Ajuste: overlay transparente com `pointer-events: none`; painel lateral mantem interacao; chat permanece centralizado (sem margem extra ao abrir o drawer).
- Commit: `5017379`.
- Pendencia: redeploy API e widget; validar digitacao no chat com card aberto.

## 2026-05-12 - Anexos por ultimo e icones ativos no painel lead

- Anexos ficam por ultimo no acordeao.
- Icones de anexos e observacoes mudam de cor quando ha conteudo.
- Pendencia: redeploy API e widget.

## 2026-05-12 - Rodape do atendimento com inicio e nome

- Rodape do painel do atendente: data/hora do inicio do atendimento e nome do usuario logado (sem UUID da sessao nem e-mail).
- Pendencia: redeploy API e widget.

## 2026-05-12 - Nome do atendente na atribuicao do lead

- Ajuste: select de atribuicao mostra nome humano (sessao/atendente atual) em vez de e-mail de cadastro.
- Pendencia: redeploy API e widget.

## 2026-05-12 - Toggle dos icones do painel do lead

- Ajuste: icones da barra do painel do lead alternam abrir/fechar a secao correspondente (widget + handoff-view).
- Pendencia: redeploy API e widget.

## 2026-05-12 - WhatsApp no topo do painel do lead

- Sintoma: card do contato mostrava "Indisponivel" no topo mesmo com `WhatsApp` em `leadContext` do Typebot.
- Ajuste: preview/copia usam `leadWhatsapp` salvo ou fallback nas variaveis do Typebot (widget + handoff-view).
- Pendencia: redeploy API e widget; validar painel com lead que informou WhatsApp no fluxo.

## 2026-05-11 - Persistencia das respostas do lead no handoff Typebot

- Causa raiz: fluxo Drax Sistemas enviava no webhook apenas `tenantId`, `sourceFlowLabel`, `contactName` e `typebotViewerUrl` (sem variaveis do fluxo).
- API: handoff agora mescla `leadContext`, `variables`, `answers` e campos extras do body; grava `leadWhatsapp` na fila ao enfileirar.
- Builder: `patchHandoffWebhookAndRedirectConfig` injeta no body do webhook as variaveis nao-sessao do typebot (`{{nome}}`) para novos syncs/imports.
- Correcao imediata no builder: typebot `cmopzmivk0025ru1czpx5k4a3` (Drax Sistemas) atualizado com `Nome_Contato`, `email`, `WhatsApp`, `categoria`, etc.
- Validacao: `npm run build:api` OK; API local nao subiu (Postgres `ECONNREFUSED` no `.env`).
- Pendencia: redeploy da API em producao; novo handoff real para confirmar `leadContext`/`leadWhatsapp` no painel; republicar viewer se necessario.

## 2026-05-11 - Handoff sem variaveis do Typebot na fila (producao)

- Sintoma: painel do atendente mostra WhatsApp indisponivel e sem variaveis.
- Producao `tenant_drax`: 11 contatos na fila, todos com `leadContext` e `leadWhatsapp` nulos.
- Ultimo teste (Marcelo, `ba0c320b-...`, 17:52Z): so nome + fluxo + atendente gravados.
- Causa: webhook do Typebot nao envia/persiste `leadContext`/`variables`; UI nao preenche WhatsApp sem `leadWhatsapp`.

## 2026-05-11 - API Easypanel vermelha: restart restaurou servico

- Sintoma: servico da API vermelho apos redeploy; usuario adicionou `JWT_SECRET` sem efeito.
- Acao do usuario: reiniciar o servico no Easypanel.
- Resultado: API voltou a responder.
- Leitura: falha provavelmente transitoria de arranque/restart do contentor, nao bloqueio por JWT (variavel nao usada no backend).
- Pendencia: se repetir, guardar log do deploy/start e comparar com commits `003d5d6`..`8dd86c5`.

## 2026-05-11 - Diff deploy API vermelho (antes x depois painel lead)

- Baseline: `003d5d6` (~1508 linhas em `queue.routes.ts`).
- Depois: `c211d99` + `ad34d48` + `79c6382` (~1955 linhas; APIs perfil/anexos; acordeoes; retry Postgres se `DATABASE_URL`).
- JWT e deps npm nao mudaram no intervalo; build local OK.
- Teste de isolamento: redeploy do commit `003d5d6` no Easypanel; se verde, bisseccionar commits seguintes.

## 2026-05-11 - JWT_SECRET nao e obrigatorio na API atual

- `JWT_SECRET` aparece so em exemplos de env; o backend nao le essa variavel no login atual (sessao no admin via storage local).
- Nao ha portal para "pegar" o segredo: se no futuro usar JWT, gera-se localmente (ex.: `openssl rand -base64 48`).

## 2026-05-11 - Easypanel API sem DATABASE_URL (modo JSON)

- Esclarecimento: `DATABASE_URL`, `AUTH_ALLOW_JSON_IN_PRODUCTION` e `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION` sao opcionais.
- Sem `DATABASE_URL`, login/assinantes usam JSON em `apps/api/data`; a API nao exige Postgres para arrancar.
- Nao adicionar `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION=true` sem `DATABASE_URL`.
- Persistencia: volume no path de `operationalDataDirectory` em `/health` (fluxos/fila/login em JSON).

## 2026-05-11 - API Easypanel vermelha apos redeploy

- Sintoma: servico `api-typebot-crm` vermelho; `/health` publico com "Service is not started".
- Causas provaveis: `AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION=true` sem `DATABASE_URL`, `DATABASE_URL` invalido ou Postgres ainda indisponivel no arranque.
- Correcao: retry de bootstrap Postgres em `auth-data-bootstrap.ts` e logs de orientacao no Easypanel.
- Pendencia: redeploy da API e validar variaveis de ambiente.

## 2026-05-11 - Painel lead compacto com acordeoes e atalhos

- Pedido: otimizar painel lateral do lead com icones, resumo do contato e secoes recolhiveis.
- Correcao: cartao com avatar/iniciais, linha de WhatsApp com copiar, barra de atalhos e acordeoes (dados, atribuicao, anexos, Typebot, observacoes) no `handoff-view` e no widget (`LeadDrawerPanel.tsx`).
- Validacao: `npm run build:api`, `npm run build:widget` OK.
- Pendencia: redeploy API + widget.

## 2026-05-11 - Painel lead ausente em producao (nao publicado)

- Sintoma: chat do atendente sem icone ao lado do nome do lead.
- Causa: drawer/APIs so no working tree local; remoto em `003d5d6`.
- Correcao: commit/push `c211d99`; CSS do widget para nao sobrescrever `button.lead-info-button`.
- Pendencia: redeploy API + widget; hard refresh apos deploy.

## 2026-05-11 - Painel lateral de dados do lead no chat do atendente

- Pedido: icone ao lado do nome do lead abre painel com edicao de nome, WhatsApp, observacoes, atribuicao a outro atendente, anexos e variaveis do Typebot.
- Correcao: `handoff-view?mode=agent` com botao no header e drawer lateral; APIs `PATCH /api/chat/queue/:contactId/profile`, `POST .../attachments` e reutilizacao de `PATCH .../assign`; widget agente com o mesmo painel.
- Arquivos: `apps/api/src/queue/queue.routes.ts`, `queue.service.ts`, `queue.repository.ts`, `apps/widget/src/WidgetApp.tsx`, `apps/widget/src/widget.css`.
- Validacao: `npm run build:api`, `npm run build:widget` OK.
- Pendencia: redeploy API e widget; smoke em producao (abrir painel, salvar perfil, anexar arquivo, transferir atendente).

## 2026-05-11 - Handoff lead: barra de envio fixa no rodape

- Sintoma: no mobile, campo `+` / mensagem / Enviar aparecia logo abaixo da primeira bolha, com area vazia abaixo.
- Causa: `.chat` sem `flex:1` e input com `sticky` sem coluna flex preenchendo a tela.
- Correcao: coluna flex em `visitor-shell` e `visitor-live-wrap`; chat com scroll; input `flex-shrink:0` no rodape.
- Arquivo: `apps/api/src/queue/queue.routes.ts`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API.

## 2026-05-11 - Chat do atendente: titulo com nome do lead

- Pedido: no painel do atendente, trocar "Atendimento ao vivo" pelo nome do lead.
- Correcao: `handoff-view` agente e widget usam `contactName` (query ou fila); admin envia `contactName` ao abrir a sessao.
- Arquivos: `apps/api/src/queue/queue.routes.ts`, `apps/admin/src/App.tsx`, `apps/widget/src/WidgetApp.tsx`.
- Validacao: `npm run build:api`, `build:admin`, `build:widget` OK.
- Pendencia: redeploy API, painel e widget.

## 2026-05-11 - Handoff lead: centralizar icone + do anexo

- Sintoma: sinal `+` desalinhado no botao de imagem da tela do lead.
- Causa: estilos genericos de `.visitor-live-wrap button` sobrescreviam o botao circular de anexo.
- Correcao: override `.visitor-live-wrap .attach-button` e `span.attach-button-symbol` com flex e ajuste vertical.
- Arquivo: `apps/api/src/queue/queue.routes.ts`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API.

## 2026-05-11 - Handoff atendente alinhado ao widget (cores, icones, layout)

- Referencia: tela escura do widget com header, avatares, timestamps, `+`/Enviar na cor do tenant e rodape de sessao.
- Correcao: `handoff-view?mode=agent` reutiliza estrutura e estilos do widget; bolhas do atendente com `defaultChatTheme.userBubbleBg` e logo do tenant.
- Arquivo: `apps/api/src/queue/queue.routes.ts`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API; opcional rebuild do painel com `VITE_WIDGET_BASE_URL` do widget publico.

## 2026-05-11 - Fundo escuro fixo no handoff-view do atendente

- Pedido: background da tela do chat do atendente sempre escuro.
- Correcao: `body.agent-screen` no `handoff-view` com `#0b1224`, inclusive no breakpoint desktop.
- Arquivo: `apps/api/src/queue/queue.routes.ts`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API.

## 2026-05-11 - Divergencia chat atendimento local x producao

- Sintoma: tela do atendente em producao sem botao `+`, tema e UX do chat local.
- Historico nos logs: WhatsApp/avatar do lead (`LOG-2026-04-21__130454`); botao `+` e imagem no widget (`memoria` 2026-04-28); auto-scroll de imagem (`LOG-2026-04-28__113600`); tema tenant no `handoff-view` agente (`ad04b76`).
- Causa: painel pode abrir widget (`VITE_WIDGET_BASE_URL`) ou fallback `/handoff-view`; producao sem widget atualizado e `handoff-view` sem picker de imagem; `WidgetApp.tsx` com ajustes locais nao publicados.
- Correcao: `handoff-view` ganhou picker `+` (agente e lead); widget passa a aceitar `apiBase` na query e resolver `tenantId` via `x-resolved-tenant-id`.
- Validacao: `npm run build:api` e `npm run build:widget` OK.
- Pendencia: redeploy API + widget; rebuild painel com `VITE_WIDGET_BASE_URL` apontando para o widget publico.

## 2026-05-11 - Build Easypanel: getByContactId ausente no QueueRepository

- Sintoma: apos `a42a7d2`, deploy falhou com TS2339 em `queue.service.ts` (`getByContactId` inexistente em `QueueRepository`).
- Causa: lookup por `contactId` existia so localmente em `queue.repository.ts`; service no remoto chamava metodo nao publicado.
- Correcao: `QueueRepository.getByContactId` retorna contato em `waitingQueue` sem exigir `tenantId`.
- Validacao: `npm run build:api` OK.
- Pendencia: push e redeploy da API no Easypanel.

## 2026-05-11 - Build Easypanel: getContactById ausente no QueueService

- Sintoma: redeploy da API falhou em `npm run build:api` com TS2551 em `queue.routes.ts` (`getContactById` inexistente em `QueueService`).
- Causa: metodo adicionado apenas localmente em `queue.service.ts`; commit `ad04b76` alterou rotas sem publicar o service.
- Correcao: expor `getContactById` delegando a `queueRepository.getByContactId`.
- Commit: `a42a7d2`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API no Easypanel apos publicar repository.

## 2026-05-11 - Cores do painel do atendente no handoff-view

- Sintoma: modo agente com tema escuro fixo, fora do padrao WhatsApp/tenant do projeto local.
- Correcao: `handoff-view` do atendente usa `defaultChatTheme` do assinante (page/chat/bubbles/botao) com defaults alinhados ao lead.
- Arquivo: `apps/api/src/queue/queue.routes.ts`.
- Validacao: `npm run build:api` OK.
- Pendencia: redeploy da API apos commit `a42a7d2`.

## 2026-05-11 - Link do atendente sem tenantId no handoff-view

- Sintoma: `/handoff-view?mode=agent` sem `tenantId` mostrava "Sessao indisponivel" mesmo com contato na fila.
- Causa: `getAgentViewUrl` no admin nao enviava `tenantId`; modo agente exige tenant na query.
- Correcao: `tenantId` na URL do handoff e do widget.
- Validacao: `npm run build:admin` OK; com `tenantId=tenant_drax` o handoff abre o chat.
- Pendencia: redeploy do painel CRM.

## 2026-05-11 - Biblioteca Etapa 3: sync silencioso sem piscar

- Removido banner "Atualizado em / Proxima atualizacao" da Etapa 3.
- Polling de 7s mantido em background; lista so re-renderiza se fluxos mudarem; status atualiza sem voltar tudo para "Verificando".
- Arquivo: `apps/admin/src/App.tsx`.
- Validacao: `npm run build:admin` OK.
- Pendencia: redeploy do painel CRM.

## 2026-05-11 - Biblioteca Etapa 3: exibir somente fluxos ativos

- Ajuste no admin: listas da Etapa 3 filtram por saude da URL (`active` ou `checking`); inativos somem da UI.
- Arquivo: `apps/admin/src/App.tsx` (`visibleLibraryFlowRows`, `activeWorkspaceOnlyFlows`).
- Validacao: `npm run build:admin` OK.
- Pendencia: redeploy do painel CRM.

## 2026-05-11 - Diagnostico sync-workspace-flows em producao

- `Cannot GET .../sync-workspace-flows` no navegador: rota era so POST; adicionado GET com o mesmo handler.
- `POST .../sync-workspace-flows` em producao: `skipReason=workspaces_list_empty`, `flowCount=1` — Builder API nao lista workspaces (base/token).
- Resposta do sync passa a incluir `builderApiBaseUrl`, `workspaceListHttpStatus`, `workspaceNames` e `hint`.
- Pendencia: ajustar env da API no Easypanel e redeploy; validar GET/POST do sync e Etapa 3.

## 2026-05-11 - Biblioteca ainda sem espelhar Typebot apos deploy API

- Sintoma: `/health` com watcher e token OK, mas Etapa 3 segue so com `Teste` inativo; `flowsSavedCount=1`.
- Hipotese: Builder API nao lista workspace (base `/api`, token ou match de nome) ou import retorna 0 sem diagnostico.
- Correcao: match compacto de workspace (nome/e-mail), fallback com workspace unico, logs de `skipReason`, endpoint `POST /api/master/tenants/:id/typebot/sync-workspace-flows`.
- Validacao local: `npm run build:api` OK.
- Pendencia: redeploy API; chamar sync-workspace-flows para `tenant_drax`; conferir `TYPEBOT_BUILDER_API_BASE_URL` com sufixo `/api`.

## 2026-05-11 - Divergencia biblioteca x Typebot (Drax Sistemas)

- Sintoma em producao: workspace Typebot com `Teste 5`, `Empréstimo do Trabalhador CLT` e `Drax Sistemas` (Live); biblioteca SaaS com apenas `Teste` inativo (`teste-0rzqap7` 404) e `Teste 5` ativo no viewer (`teste-5-olx3rjp` 200).
- Causa raiz: importacao automatica do watcher/listagem nao autenticava na Builder API quando `TYPEBOT_TARGET_BUILDER_API_TOKEN` estava vazio e o fallback era `TYPEBOT_BUILDER_API_TOKEN` (mesma regra do `typebot-builder.service`); tenant `tenant_drax` seguia sem `typebotWorkspaceId` (`not_started`).
- Correcao: alinhar resolucao de token no `typebot-flow-viewer-url-sync`; vinculo automatico de workspace por nome sanitizado do assinante e fallback unico por e-mail; `/health` expoe `typebotTenantFlowImportConfigured` e aviso no boot se token ausente.
- Validacao local: `npm run build:api` OK.
- Pendencia: redeploy da API no Easypanel; conferir env `TYPEBOT_TARGET_BUILDER_API_TOKEN` ou `TYPEBOT_BUILDER_API_TOKEN` e `TYPEBOT_TARGET_VIEWER_BASE_URL`; apos deploy, reabrir Etapa 3 e validar importacao dos fluxos Live.

## 2026-05-11 - Abertura do chat Typebot

- Solicitacao: abrir o chat nomeado Typebot.
- Chat principal: `946834a9-5796-434d-b8d2-6ac05dbfe776` (projeto `D:\typebot-Saas`).
- Chat anterior de retomada: `02e7118b-8434-4de2-9be6-27202fc61c7d`.
- Ultimo commit citado no chat: `236b026` (auto-descoberta de workspace Typebot no backend).
- Acao nesta sessao: workspace `D:\typebot-Saas` reaberto no Cursor; contexto do chat recuperado por `doc/memoria.md` e transcript.
- Pendencias de retomada: deploy da API no Easypanel; publicar fluxo novo no Typebot; validar importacao automatica na biblioteca; se falhar, revisar match exato de nome do workspace versus nome do tenant.

## 2026-05-08 - Backend autonomo: auto-descoberta de workspace Typebot

- Ajuste de arquitetura conforme solicitacao do usuario: nao depender de acao no painel para importacao automatica.
- Implementado no backend (`typebot-flow-viewer-url-sync`):
  - quando `typebotWorkspaceId` estiver vazio, a API tenta descobrir workspace via Builder API (`GET /v1/workspaces`);
  - se houver match exato por nome do tenant, vincula automaticamente no tenant (`typebotWorkspaceId`, `typebotWorkspaceName`, `provisioned`) e segue com importacao.
- O watcher de importacao agora usa essa resolucao automatica tanto para:
  - `importManualWorkspaceTypebotsIntoTenantFlows`
  - `refreshFlowViewerUrlFromTypebot`
  - `refreshTenantFlowViewerUrls`
- Validacao: `npm run build:api` e `ReadLints` sem erros.

## 2026-05-08 - Solucao definitiva: vinculo manual do workspace Typebot por assinante

- Causa raiz consolidada: watcher/autosync nao importava fluxos porque `tenant_drax` estava sem `typebotWorkspaceId`.
- Implementacao aplicada:
  - API aceita e persiste no update do assinante:
    - `typebotWorkspaceId`
    - `typebotAccessUrl`
  - Ao salvar `typebotWorkspaceId`, tenant passa para `typebotProvisionStatus = provisioned` com `typebotLastSyncAt` atualizado.
  - Painel Admin (Editar assinante) ganhou campos:
    - `Typebot Workspace ID (obrigatório para autoimport)`
    - `Typebot Access URL (opcional)`
- Arquivos principais:
  - `apps/api/src/tenants/tenant.service.ts`
  - `apps/api/src/tenants/tenant.repository.ts`
  - `apps/admin/src/App.tsx`
- Validacao: `npm run build:api`, `npm run build:admin` e `ReadLints` sem erros.

## 2026-05-08 - Publicacao pendente explicava ausencia do indicador

- Diagnostico: ultimo commit remoto estava em `3798619` (API). As mudancas visuais do painel (`apps/admin/src/App.tsx`, `styles.css`) ainda estavam apenas locais, sem push.
- Impacto: deploy do Easypanel do painel nao tinha como trazer o indicador novo.
- Acao: preparar commit/push exclusivo do painel com indicador somente na Biblioteca de fluxos (sem Fila ao vivo).

## 2026-05-08 - Escopo do indicador ajustado: somente Biblioteca de fluxos

- Ajuste solicitado pelo usuario: remover indicador da `Fila ao vivo`.
- Aplicado:
  - removido banner "Atualizado em / Próxima atualização" da tela `liveQueue`;
  - mantido apenas na tela `Master > Etapa 3 — Biblioteca de fluxos`.
- Validacao: `npm run build:admin` e `ReadLints` sem erros.

## 2026-05-08 - Indicador de atualizacao tambem na Biblioteca (Etapa 3)

- Ajuste aplicado apos validacao do usuario: o indicador visual nao aparecia porque estava apenas na tela `Fila ao vivo`.
- Implementado tambem na tela `Master > Etapa 3 — Biblioteca de fluxos`:
  - `Atualizado em HH:mm:ss`
  - `Próxima atualização em Ns` (contagem regressiva)
- Polling da biblioteca configurado em 7s (`FLOW_LIBRARY_REFRESH_INTERVAL_MS = 7000`) quando a tela da etapa 3 esta ativa.
- Validacao: `npm run build:admin` e `ReadLints` sem erros.

## 2026-05-08 - Indicador visual de atualizacao na Fila ao vivo

- Implementado no painel admin (tela `liveQueue`) um banner com:
  - `Atualizado em HH:mm:ss`
  - `Próxima atualização em Ns` (contagem regressiva)
- Mudancas:
  - `apps/admin/src/App.tsx`: novos estados `queueLastUpdatedAt` e `queueNextRefreshInSeconds`; reset da contagem a cada `loadQueue`; render do banner na seção da fila.
  - `apps/admin/src/styles.css`: estilos dos pills, ponto pulsante e animacao.
- Intervalo do polling mantido em 3s (`QUEUE_REFRESH_INTERVAL_MS = 3000`) e a contagem regressiva sincronizada com esse ciclo.
- Validacao: `npm run build:admin` e `ReadLints` sem erros.

## 2026-05-08 - Watcher automatico de fluxos Typebot (5-8s)

- Implementado watcher no `apps/api/src/server.ts` para importar automaticamente novos fluxos publicados no Typebot do assinante.
- Configuracao:
  - `TYPEBOT_TENANT_FLOW_WATCHER_ENABLED` (default `true`)
  - `TYPEBOT_TENANT_FLOW_WATCHER_INTERVAL_MS` (default `7000`, com clamp entre `5000` e `8000`)
- Comportamento:
  - roda em loop com protecao anti-concorrencia (`isTenantFlowWatcherRunning`);
  - percorre tenants e executa `importManualWorkspaceTypebotsIntoTenantFlows(tenantId)`;
  - registra log operacional `[typebot-tenant-flow-sync] tenants=<n> imported=<n>`.
- Validacao local: `npm run build:api` e `ReadLints` sem erros.

## 2026-05-08 - Inclusao manual de fluxo via API para tenant_drax

- Restricao operacional confirmada: UI atual nao tem acao de provisionar/vincular workspace Typebot nem cadastro direto por URL nessa tela.
- Acao aplicada: criacao manual de fluxo pelo endpoint `POST /api/master/tenants/tenant_drax/flows` com URL publicada do viewer.
- Resultado: fluxo criado com sucesso (`201`) e `GET /health` passou de `flowsSavedCount: 0` para `1`.
- Proximo passo: executar redeploy de prova e confirmar que `flowsSavedCount` permanece `>= 1` (validacao final da persistencia do volume).

## 2026-05-08 - Fluxo nao aparece por workspace Typebot nao provisionado

- Verificacao direta em producao:
  - `GET /health` retorna campos operacionais e `flowsSavedCount: 0`.
  - `GET /api/master/tenants/tenant_drax/flows` retorna lista vazia.
  - `GET /api/master/tenants` mostra `tenant_drax` com `typebotProvisionStatus: "not_started"` e `typebotAccessUrl: ""`.
- Causa raiz atual: tenant sem workspace Typebot vinculado/provisionado; por isso o auto-sync (`synced=1`) nao traz fluxo para a biblioteca do tenant.
- Proximo passo: provisionar/vincular o workspace Typebot do tenant no Admin e repetir teste de listagem.

## 2026-05-08 - Publicacao de /health operacional para master

- Acao executada: preparado commit com `apps/api/src/server.ts` para expor no `/health` os campos `flowsSavedCount`, `tenantsCount`, `operationalDataBackend`, `operationalDataDirectory`, `operationalSavedFlowsFile` e `operationalDataHint`.
- Contexto: producao no Easypanel estava a responder `/health` antigo sem campos operacionais, impedindo descobrir o path correto de volume.
- Validacao local: `npm run build:api` concluido com sucesso antes do push.
- Proximo passo: push no GitHub `master` e novo deploy no Easypanel; depois validar `/health` e montar volume no `operationalDataDirectory`.

## 2026-05-08 - Pos-deploy ainda sem campos operacionais no /health

- Evidencia: apos deploy manual no Easypanel, `GET /health` continua com apenas `status`, `service`, `authTenantsAttendants`.
- Diagnostico: o container publicado ainda nao contem o `server.ts` atualizado (desvio de branch/commit/repo ou de pipeline de build no servico).
- Proxima acao guiada: validar no GitHub (branch `master` usada pelo Easypanel) se `apps/api/src/server.ts` contem `operationalDataDirectory`; se nao contiver, publicar commit correto e redeploy.

## 2026-05-08 - Deploy API executado no Easypanel (etapa guiada)

- Serviço confirmado: `soma / api-typebot-crm`, origem GitHub (`walkup-tec/typeBot`, branch `master`), builder Nixpacks.
- Comandos de deploy vistos no log: `npm run build:api`, `npm run start:api`, processo iniciado com `node dist/server.js`.
- Estado atual: API reiniciada com sucesso aparente; próxima validação é ler `GET /health` e confirmar presença de `operationalDataDirectory`, `flowsSavedCount` e `operationalSavedFlowsFile`.
- Próximo passo operacional: se campos novos aparecerem, configurar volume persistente exatamente em `operationalDataDirectory`.

## 2026-05-07 - Produção: /health só com postgres (artifact antigo da API)

- Evidência: `GET https://soma-api-typebot-crm.../health` devolve apenas `status`, `service`, `authTenantsAttendants` — **não aparece** `flowsSavedCount`, `operationalDataDirectory`, etc.
- Conclusão: o serviço em Easypanel ainda está a correr uma **build anterior** ao `/health` estendido. Próximo passo operacional é **deploy da API com o código atual** (onde `/health` expõe o path exato do volume).
- Até ao deploy: o ficheiro de fluxos continua a ser `saved-flows.json` sob a pasta `data` da API; no código local isso resolve para `apps/api/data` (absoluto = `dirname` de `getDataFilePath('saved-flows.json')`). No container, o path absoluto depende do `WORKDIR`/layout do build — validar com `find`/`ls` dentro do contentor se necessário.

## 2026-05-07 - Fix definitivo de sessao intermitente no modo agente

- Causa raiz confirmada: o modo agente ainda dependia de `tenantId` na URL para montar `x-tenant-id`; quando o link carregava tenant ausente/desatualizado, o frontend forçava tenant errado e retornava "Sessão não encontrada para este tenant".
- Correção aplicada:
  - `apps/admin/src/App.tsx`: `getAgentViewUrl` deixou de enviar `tenantId` na URL do modo agente.
  - `apps/api/src/queue/queue.routes.ts`: `handoff-view` agora resolve `tenantId` por `contactId` quando query não vier; endpoints de sessão/fila retornam `x-resolved-tenant-id`.
  - `apps/widget/src/WidgetApp.tsx`: modo agente não exige mais `tenantId`; headers agora enviam `x-tenant-id` apenas quando disponível e capturam `x-resolved-tenant-id` para estabilizar polling/brand lookup.
- Validação executada: `npm run build` (api/admin/widget) + `ReadLints` sem erros.
- Próximo passo sugerido: smoke manual abrindo atendimento por links antigos e novos de agente para confirmar ausência de regressão no handoff.

## 2026-05-07 - Rotina segura: auto-heal da biblioteca e status de fluxo

- Causa raiz observada em produção: fluxo salvo com host de viewer inválido para aquele slug (`typebot-...` retornando 404 enquanto `soma-typebot-...` estava 200).
- Correção pontual executada: recriação do fluxo `Drax Sistemas` no tenant `tenant_drax` com URL ativa do viewer.
- Prevenção definitiva implementada no código:
  - `lib/flow-url-health.ts`: nova `probeFlowUrlStatus()` com fallback automático entre hosts `typebot-` e `soma-typebot-`.
  - `typebot.routes.ts` (`GET /api/typebot/flow-status`): retorna `resolvedUrl`/`fallbackUrl` para diagnóstico consistente.
  - `flow.routes.ts` (`GET /api/master/tenants/:tenantId/flows`): rotina `selfHealTenantFlowViewerUrls()` corrige automaticamente URL do fluxo quando fallback ativo é detectado.
- Resultado esperado: biblioteca não volta a marcar fluxo como inativo só por variação de host do viewer; URL é auto-reparada no primeiro carregamento da lista.

## 2026-05-07 - Fluxos sumindo após deploy: causa infra + mitigação

- **Causa raiz:** `saved-flows.json` e outros JSON operacionais vivem no disco da API (`apps/api/data`). Postgres cobre apenas tenants/atendentes. Redeploy **sem volume persistente** recria disco → biblioteca volta vazia.
- **Correção imediata (produção):** recriação via `POST .../tenants/:id/flows` para `tenant_drax` até volume estar correto.
- **Mitigação no código:** `GET /health` passa `flowsSavedCount`, `operationalDataBackend`, `operationalDataDirectory`, `operationalSavedFlowsFile`, hints; arranque em produção emite `[saas-data]` com aviso quando há tenants mas zero fluxos.
- **Doc:** `doc/EASYPANEL-VOLUME-FLUXOS-FILA.md`; secção destacada em `doc/POSTGRES-AUTH-TENANTS-ATTENDANTS.md`.

## 2026-05-04 - Postgres para login (tenants + attendants)

- Com `DATABASE_URL`, assinantes e atendentes persistem em Postgres (`saas_tenants`, `saas_attendants`); redeploy do contentor da API não apaga logins. Migração automática JSON→Postgres se Postgres vazio e ficheiros existirem.
- Bootstrap `bootstrap/auth-data-bootstrap.ts`; módulo `lib/auth-postgres.ts`; `reloadFromStorage` em auth; health com `authTenantsAttendants`.
- Doc: `doc/POSTGRES-AUTH-TENANTS-ATTENDANTS.md`, `doc/LOG-2026-05-04__174500__feat-postgres-auth-tenants-attendants.md`, env em `doc/EASYPANEL-AMBIENTE.env.example`.

### Palavras-chave

- `DATABASE_URL`
- `saas_tenants`
- `auth-postgres`

## 2026-05-04 - Login após deploy: volume + seed opcional (base vazia)

- Causa recorrente: sem volume em `apps/api/data`, redeploy zera JSON → 401/404.
- Código: `API_SEED_ON_EMPTY` + env documentados em `doc/EASYPANEL-AMBIENTE.env.example`; bootstrap `apps/api/src/bootstrap/seed-tenant-on-empty.ts`.
- LOG: `doc/LOG-2026-05-04__120000__feat-api-seed-on-empty-easypanel-login.md`.

### Palavras-chave

- `API_SEED_ON_EMPTY`
- `apps/api/data`
- `volume Easypanel`

## 2026-05-03 - Deploy VPS chattypebot.com e admin com VITE_API_BASE_URL

- Admin deixa de fixar `localhost:3333`: usa **`VITE_API_BASE_URL`** no build (`apps/admin/.env.example`).
- Guia `doc/DEPLOY-VPS-chattypebot-com.md`: mesmo VPS que outros sites, hostname novo, API/admin/widget, Nginx, PM2, `HANDOFF_PUBLIC_BASE_URL`.
- LOG: `doc/LOG-2026-05-03__230000__admin-vite-api-base-and-deploy-chattypebot-com.md`.

### Palavras-chave

- `DEPLOY-VPS-chattypebot-com`
- `VITE_API_BASE_URL`

## 2026-05-03 - Redirect Typebot: url_direct, HTTP 200 e HANDOFF_PUBLIC_BASE_URL

- Handoff devolve **200** e JSON com **`url_direct`** (raiz + `data`) para alinhar com Redirect `{{url_direct}}`.
- Env **`HANDOFF_PUBLIC_BASE_URL`**: base fixa dos links do handoff quando o Host da requisição é túnel/local errado.
- Patch do schema Typebot: blocos **Webhook** e **HTTP Request**; `bodyPath` de URLs antigas normalizado para **`url_direct`**; só patch se existir `options.webhook` objeto.
- Ver `doc/LOG-2026-05-03__220000__fix-typebot-redirect-url-direct-handoff-public-url.md`.

### Palavras-chave

- `HANDOFF_PUBLIC_BASE_URL`
- `url_direct`
- `handoff-status-200`

## 2026-05-03 - Handoff / Redirect Typebot: resolver tenant por publicId e viewer URL

- `POST /api/typebot/handoff` passou a associar fluxos pelo **publicId** (`typebotPublicId` ou ultimo segmento da URL do viewer), pelo **displayLabel**, pela URL que contem `/{token}`, alem do **nickname**.
- Se o body trouxer **`typebotViewerUrl`**, o publicId extraido dessa URL tambem e usado para bater com o fluxo salvo (uteis quando `sourceFlowLabel` no Typebot nao bate com o apelido do painel).
- Fluxos duplicados na lista sao deduplicados por `id`.
- Ver LOG: `doc/LOG-2026-05-03__213000__fix-handoff-tenant-resolution-publicid-viewer-url.md`.

### Palavras-chave para pesquisa futura

- `typebot-handoff-tenant-resolution`
- `sourceFlowLabel-publicId`
- `typebotViewerUrl-handoff`

## 2026-05-03 - Fluxos criados no Typebot entram na biblioteca do assinante

- Funcao `importManualWorkspaceTypebotsIntoTenantFlows`: lista typebots do workspace do tenant e cria `SavedFlow` em falta (dedupe por `typebotRemoteId` / publicId / URL).
- So inclui fluxos com viewer URL ativa; sem `librarySourceId`.
- Chamada no `GET .../tenants/:tenantId/flows` e no fim de `syncSystemDefaultsToRealTypebotWorkspace`.
- Campo opcional `typebotRemoteId` em `SavedFlow`.

### Palavras-chave para pesquisa futura

- `import-manual-workspace-typebots`
- `typebotRemoteId`

## 2026-05-03 - Opcao "Nao tenho atendente" (fila so para Master)

- Flag por tenant: `noSeparateAttendants` via PATCH de perfil (`profile-image`).
- Fila: `attendantsForQueueRouting` em `queue.routes.ts` restringe distribuicao automatica a usuarios `role === "master"` quando a flag esta ativa.
- Admin Etapa 2: checkbox, oculta cadastro de novos atendentes, `assignContact` usa login do Master como `agentId`.
- Ver LOG: `doc/LOG-2026-05-03__160000__feat-no-separate-attendants-master-only-queue.md`.

### Palavras-chave para pesquisa futura

- `no-separate-attendants`
- `master-only-queue-routing`
- `nao-tenho-atendente`

## 2026-05-03 - Logo da marca nao apaga mais imagem de compartilhamento

- Ao salvar a logo, o PATCH inclui `shareImageUrl` e outros campos ja preenchidos no formulario para nao perder a preview antes de "Proxima etapa".
- Hint na logo: **500x500 px recomendado**.

### Palavras-chave para pesquisa futura

- `share-image-lost-on-logo-upload`
- `persist-profile-merge-share-image`

## 2026-04-28 - Configuracao de ordem da fila substituindo descricao

- Campo `Descricao` do perfil foi removido e substituido por `Ordem para fila de atendimento`.
- Novas opcoes por tenant:
  - `assign_per_incoming` (distribuicao ciclica / round-robin)
  - `shared_pool` (todos os atendimentos disponiveis para todos)
  - `random` (distribuicao aleatoria)
- A regra agora e aplicada no momento de entrada de novos atendimentos (handoff e enqueue manual).

### Palavras-chave para pesquisa futura

- `ordem-fila-atendimento`
- `queue-distribution-mode-tenant`
- `shared-pool-round-robin-random`

## 2026-04-28 - Opcao de WhatsApp na tela de espera do handoff

- Adicionada configuracao por tenant para definir se o WhatsApp aparece como segunda opcao de atendimento.
- Master Console recebeu seletor com as duas opcoes:
  - com botao WhatsApp
  - sem botao WhatsApp
- Tela `/handoff-view` passou a respeitar essa preferencia ao renderizar o bloco de acoes.

### Palavras-chave para pesquisa futura

- `usewhatsappsecondoption`
- `handoff-wait-whatsapp-toggle`
- `master-console-whatsapp-second-option`

## 2026-04-28 - Alertas de pendencia na Fila ao Vivo (badge + resumo + som)

- Implementado `badge` com contagem de pendentes no menu `Fila ao vivo`.
- Implementado alerta visual persistente no topo com resumo de pendencias e atalho para abrir a fila.
- Implementado aviso sonoro ao detectar aumento de pendentes na fila.
- Ajustado polling da fila para atualizar em todas as telas (com tenant selecionado), nao apenas quando a tela da fila esta ativa.

### Palavras-chave para pesquisa futura

- `fila-ao-vivo-badge-pendentes`
- `resumo-pendente-persistente`
- `notificacao-sonora-novo-lead`
- `polling-fila-todas-telas`

## 2026-04-28 - Ajuste de tunel para teste do fluxo Ideal Cred

- URL publica anterior do webhook de handoff estava indisponivel (erro de gateway).
- Novo tunel Serveo foi gerado e aplicado em `TYPEBOT_HANDOFF_WEBHOOK_URL`.
- API local reiniciada para recarregar `.env`, restaurando caminho de teste para redirect/handoff.

### Palavras-chave para pesquisa futura

- `tunnel-refresh-idealcred`
- `typebot-handoff-webhook-url-update`
- `serveo-handoff-fix`

## 2026-04-28 - Endpoint manual de backfill para nome de atendente

- Criado endpoint de manutencao `POST /api/master/queue/backfill-agent-names` para forcar a hidratacao de `assignedAgentName` em registros antigos da fila.
- Resolucao de tenant por `body.tenantId` (prioritario) com fallback para contexto de tenant da requisicao.
- Build da API validado apos ajuste (`npm run build:api`).

### Palavras-chave para pesquisa futura

- `manual-backfill-agent-names`
- `queue-assignedagentname-hydration`
- `api-master-queue-backfill-agent-names`

## 2026-04-28 - Recuperacao de tunel e redirect (nova rotacao)

- Tunel anterior caiu e gerou falha de redirect.
- Novo tunel Serveo ativo configurado e aplicado no `.env` da API.
- API reiniciada e tenant Ideal Cred re-sincronizado para reaplicar webhook no Typebot.
- Validado webhook do fluxo publicado apontando para URL nova.
- POST publico no handoff retornando `201` com `urlFlat`.

### Palavras-chave para pesquisa futura

- `tunnel-rotation-redirect-recovery`
- `serveo-new-url-handoff`
- `sync-defaults-after-env-change`

## 2026-04-28 - Novo layout da fila com acoes por icones

- Tela de fila ajustada para manter colunas em uma unica linha no desktop.
- Coluna `Ação` passou a usar dois icones:
  - `🔍` para abrir dados do Lead;
  - `💬` para iniciar atendimento.
- Icone de conversa pulsa quando o contato esta pendente (`waiting`).
- Apos iniciar atendimento (`in_service`), icone de conversa fica neutro e bloqueado.
- Build e linter do admin validados sem erros.

### Palavras-chave para pesquisa futura

- `fila-icone-lupa-conversa`
- `conversa-pulsando-pendente`
- `conversa-neutra-bloqueada-atendido`
- `queue-grid-single-line`

## 2026-04-28 - Visualizacao dos dados do Lead na fila ao vivo

- Fila ao vivo recebeu acao `Ver dados do Lead` por contato.
- Botao abre modal com dados estruturados (`leadContext`) em formato chave/valor.
- Acao fica desabilitada quando o contato nao possui contexto salvo.
- Estilos dedicados adicionados para leitura limpa no modal.
- Build e linter do admin validados sem erros.

### Palavras-chave para pesquisa futura

- `ver-dados-do-lead-fila`
- `leadcontext-modal-ui`
- `acao-por-linha-livequeue`

## 2026-04-28 - Persistencia de dados do Lead no backend da fila

- Implementada persistencia de `leadContext` diretamente no contato da fila (`QueueContact`).
- `enqueueSchema` foi ampliado para aceitar `leadContext` opcional.
- No handoff, `leadContext` resolvido agora e salvo no `enqueue` (alem de seguir para `handoff-view`).
- Build da API e linter validados sem erros.

### Palavras-chave para pesquisa futura

- `leadcontext-persistido-fila`
- `queuecontact-leadcontext`
- `handoff-enqueue-com-contexto`

## 2026-04-28 - Fila ao vivo ajustada (ordem, contato, fluxo, status e atendente)

- Fila passou a ser ordenada por `updatedAt` decrescente (mais recentes no topo).
- Handoff agora resolve nome real do lead e salva como `contactName` na fila.
- `sourceFlowLabel` da fila passou a priorizar `flowAlias` (nome amigavel do fluxo Typebot).
- Tabela da fila no admin separou `Status` e `Atendente` em colunas distintas.
- Mapeamento `assignedAgentId -> displayName` aplicado na lista para mostrar nome do atendente.
- Build de `api` e `admin` validado sem erros.

### Palavras-chave para pesquisa futura

- `fila-mais-recentes-primeiro`
- `nome-lead-no-contato`
- `flowalias-fila-origem`
- `coluna-atendente-separada-status`

## 2026-04-28 - Auto-scroll no envio de imagem (Lead e Atendente)

- Implementado auto-scroll para o final da conversa em ambos os chats quando mensagem de imagem chega.
- No widget, scroll ocorre ao atualizar `messages` e novamente no `onLoad` da imagem.
- No `handoff-view`, adicionados listeners de `load` para `img.msg-image` antes do scroll final.
- Resultado: conversa acompanha automaticamente a imagem carregada no fim da thread.
- Build de `api` e `widget` validados sem erros.

### Palavras-chave para pesquisa futura

- `auto-scroll-imagem-lead-atendente`
- `onload-image-scroll-chat`
- `scroll-bottom-messages-update`

## 2026-04-28 - Redirect corrigido com hardening de .env + patch de webhook

- Investigacao mostrou que o fluxo publicado mantinha URL antiga no bloco `Webhook` mesmo apos sync.
- Causa raiz: carregamento de ambiente inconsistente ao subir API pela raiz (valor de `apps/api/.env` nao aplicado de forma confiavel).
- Backend recebeu loader dedicado (`load-env`) e `server.ts` passou a iniciar com esse bootstrap.
- Sync ganhou hardening para patchar/publicar webhook de handoff em fluxos existentes.
- Validado no schema publicado: URL do webhook atualizada para o tunel ativo e handoff publico retornando `201` com `urlFlat`.

### Palavras-chave para pesquisa futura

- `hardening-dotenv-monorepo-api`
- `webhook-antigo-pos-sync`
- `patch-handoff-existing-typebot`
- `redirect-recovery-after-tunnel-change`

## 2026-04-28 - Falha de redirect por tunel indisponivel (503) corrigida

- Diagnostico confirmou API local `200` e URL publica antiga do webhook com `503`.
- Novo tunel ativo configurado via Serveo para `localhost:3333`.
- `TYPEBOT_HANDOFF_WEBHOOK_URL` atualizado no `.env` para a nova URL publica.
- API reiniciada e tenant Ideal Cred re-sincronizado para reaplicar webhook/config no Typebot.
- POST de validacao no endpoint publico de handoff retornou `201`.

### Palavras-chave para pesquisa futura

- `redirect-503-tunnel-unavailable`
- `serveo-handoff-webhook`
- `restart-api-after-env-handoff`
- `sync-defaults-idealcred-tunnel`

## 2026-04-28 - Botao "+" no chat com envio de imagem

- Adicionado botao `+` na barra de mensagem do widget para selecionar imagem.
- Fluxo de upload implementado com compressao/redimensionamento no frontend antes do envio.
- Mensagens com `data:image/` agora sao renderizadas como imagem dentro da bolha.
- Backend teve limite de `content` ampliado para aceitar payload de imagem compactada.
- Builds de `api` e `widget` validados sem erros.

### Palavras-chave para pesquisa futura

- `botao-mais-upload-chat`
- `mensagem-imagem-dataurl-widget`
- `content-max-300000-queue`

## 2026-04-28 - Sistema ainda mais discreto

- Realizado segundo ajuste fino para reduzir ainda mais o destaque da bolha `Sistema`.
- Borda, fundo e textos foram aproximados do tom base do painel.
- Mantida legibilidade com hierarquia suave de tipografia.
- Build e linter do widget validados sem erros.

### Palavras-chave para pesquisa futura

- `sistema-ainda-mais-discreto`
- `second-pass-system-softening`
- `low-contrast-system-bubble`

## 2026-04-28 - Suavizacao do bloco Sistema (menos destaque)

- Bloco `Sistema` recebeu ajuste de paleta para ficar mais discreto.
- Saturacao e contraste reduzidos em borda, fundo e textos.
- Layout estrutural foi preservado, alterando somente intensidade visual.
- Build e linter do widget validados sem erros.

### Palavras-chave para pesquisa futura

- `sistema-mais-discreto`
- `menos-destaque-bolha-sistema`
- `ajuste-fino-paleta-sistema`

## 2026-04-28 - Layout de mensagens do sistema alinhado com referencia

- Mensagens `Sistema` no chat receberam novo visual para aderir ao mock enviado.
- Ajustados fundo e borda para tom azul escuro com destaque.
- Hierarquia de texto refinada em `strong`, `p` e `small` para reproduzir contraste da referencia.
- Sem alteracoes nos blocos do lead e da Ideal Cred.
- Build e linter do widget validados.

### Palavras-chave para pesquisa futura

- `layout-sistema-chat-azul`
- `system-message-contrast-tuning`
- `live-message-system-reference`

## 2026-04-28 - Ajuste do icone do lead para igualar referencia

- Icone do avatar do lead foi ajustado para ficar visualmente mais proximo do modelo enviado.
- Emoji foi removido e substituido por desenho vetorial em CSS (cabeca + tronco).
- Cores do avatar do lead foram refinadas para melhor aderencia ao padrao solicitado.
- Build e linter do widget validados sem erros.

### Palavras-chave para pesquisa futura

- `icone-lead-css-vetorial`
- `avatar-lead-head-body`
- `match-icon-reference-left-chat`

## 2026-04-28 - Lado esquerdo do chat no padrao da referencia

- Ajustado somente o lado esquerdo (lead) para o visual da referencia enviada.
- Mensagens do lead receberam bolha azul com tipografia adequada ao mock.
- Avatar do lead foi adicionado no lado esquerdo das mensagens do visitante.
- Lado direito (Ideal Cred) foi mantido sem alteracoes adicionais.
- Build e linter do widget validados sem erros.

### Palavras-chave para pesquisa futura

- `lead-left-side-reference-style`
- `visitor-blue-bubble-widget`
- `keep-right-side-unchanged`

## 2026-04-28 - Nova reversao para configuracao antiga do chat

- Revertido novamente o ajuste de alinhamento da direita (`row-reverse`) a pedido do usuario.
- Layout do chat voltou para a configuracao anterior.
- Build e linter do widget validados sem erro.

### Palavras-chave para pesquisa futura

- `nova-reversao-chat-direita`
- `rollback-row-reverse`
- `restaurar-config-antiga-widget`

## 2026-04-28 - Ajuste pontual do lado direito conforme referencia

- Aplicado ajuste pontual no lado direito do chat para alinhamento fiel ao desenho.
- Regra `.live-message-row.mine` recebeu `flex-direction: row-reverse`.
- Mudanca restrita ao posicionamento de avatar/balao da direita, sem alterar tema global.
- Build do widget validado com sucesso.

### Palavras-chave para pesquisa futura

- `lado-direito-chat-row-reverse`
- `ajuste-pontual-referencia-layout`
- `mine-message-alignment`

## 2026-04-28 - Reversao do ajuste visual do lado direito no chat

- Revertido ajuste visual recente do lado direito a pedido do usuario.
- Widget voltou ao comportamento anterior de bolha/avatar (antes da tentativa de fidelidade adicional).
- Classes de sender (`agent`/`visitor`) foram restauradas nas mensagens.
- Build do widget validado sem erros apos a reversao.

### Palavras-chave para pesquisa futura

- `rollback-ajuste-visual-lado-direito`
- `restore-widget-chat-style`
- `reverter-fidelidade-chat`

## 2026-04-28 - Fallback do nome do atendente no widget

- Corrigido caso em que o rodape ainda mostrava `atendente-01`.
- Widget passou a resolver `displayName` via endpoint de atendentes do tenant quando `agentName` nao vier valido.
- Matching implementado por `username` (e fallback por `id`) contra `sessionAgentId`.
- Mantido fallback seguro para `agentId` quando a consulta nao estiver disponivel.
- Build do widget validado com sucesso.

### Palavras-chave para pesquisa futura

- `fallback-nome-atendente-widget`
- `resolve-displayname-attendants-endpoint`
- `agentid-para-displayname`

## 2026-04-28 - Fidelidade visual do lado direito no chat ao vivo

- Lado direito ajustado para refletir melhor o desenho de referencia (icone + cor do assinante).
- Avatar da direita agora usa estilo dinamico do branding (borda/fundo) e contraste coerente.
- Posicionamento do avatar da direita corrigido para o extremo direito com `row-reverse` nas mensagens `mine`.
- Lado esquerdo foi neutralizado para manter padrao fixo do sistema, sem variacao por sender.
- Build do widget validado com sucesso.

### Palavras-chave para pesquisa futura

- `fidelidade-lado-direito-chat`
- `avatar-direita-row-reverse`
- `left-side-system-neutral`

## 2026-04-28 - Nome dinamico do atendente no widget

- Rodape do modo agente no widget deixou de exibir valor fixo (`atendente-01`).
- Admin passou a abrir o widget com `agentName` na querystring, usando `authSession.user.displayName`.
- Widget atualizado para ler `agentName` e aplicar fallback para `agentId` quando necessario.
- Build do `admin` e `widget` validado com sucesso.

### Palavras-chave para pesquisa futura

- `atendente-dinamico-widget`
- `agentname-displayname-livechat`
- `footer-atendente-logado`

## 2026-04-28 - Botao Enviar com cor do assinante

- Botao `Enviar` do chat ao vivo passou a usar a cor predominante do assinante.
- Aplicado em ambos os modos (agente e visitante).
- Cor de fonte do botao continua com contraste automatico para legibilidade.

### Palavras-chave para pesquisa futura

- `send-button-tenant-color`
- `livechat-enviar-branding`
- `cta-contrast-assinante`

## 2026-04-28 - Painel ao vivo com lado direito no branding do assinante

- Ajustado widget de atendimento ao vivo para manter lado esquerdo padrao do sistema.
- Mensagens do lado direito agora usam identidade do assinante: cor predominante + logo/avatar.
- Implementado calculo automatico de contraste para fonte e timestamp nos baloes da direita.
- Incluidos fallbacks de iniciais e cor padrao para casos sem branding completo.

### Palavras-chave para pesquisa futura

- `chat-live-right-tenant-branding`
- `left-system-right-tenant-pattern`
- `dynamic-contrast-live-messages`

## 2026-04-28 - Compatibilidade final para Redirect do fluxo CLT

- Investigacao mostrou que a variavel `url_direct` nao estava sendo preenchida em execucoes reais.
- Endpoint de handoff ajustado para retornar URL tanto na raiz (`urlFlat`) quanto em `data.urlFlat`.
- Mapping do Webhook no Typebot ajustado para `data.urlFlat` e fluxo republicado.
- Validado endpoint publico ativo retornando os dois formatos de payload para robustez.

### Palavras-chave para pesquisa futura

- `url-direct-nao-preenchida`
- `handoff-response-data-urlflat`
- `redirect-clt-compatibilidade-final`

## 2026-04-28 - Redirect do fluxo CLT restaurado com webhook publico ativo

- Detectado que o Redirect nao funcionava por webhook herdado da origem Walkup com tunnel inativo.
- Configurado novo endpoint publico ativo para `/api/typebot/handoff` e aplicado no fluxo da IdealCred.
- Confirmado retorno `urlFlat` no webhook e mapping correto no Typebot (`bodyPath: urlFlat`).
- Registrado em `.env` `TYPEBOT_HANDOFF_WEBHOOK_URL` para reduzir reincidencia.

### Palavras-chave para pesquisa futura

- `redirect-falha-por-webhook-inativo`
- `typebot-urlflat-com-tunnel`
- `idealcred-clt-handoff-restaurado`

## 2026-04-28 - Correcao do Redirect no fluxo CLT (mapping + tenant)

- Identificado que o Redirect falhava por mapping legado (`data.urlFlat`) e `tenantId` incorreto no webhook do Typebot.
- Corrigido no fluxo publicado para usar `bodyPath: urlFlat` e `tenantId` da IdealCred.
- Aplicado hardening no backend para normalizar esse padrão em sync/import futuros.
- Confirmado: URL atual do webhook está inativa (`404`), exigindo endpoint público ativo para o redirect funcionar em produção.

### Palavras-chave para pesquisa futura

- `redirect-webhook-urlflat`
- `tenantid-correto-no-handoff`
- `webhook-public-endpoint-404`

## 2026-04-28 - Verificacao operacional da rotina anti-404 no fluxo IdealCred

- Reexecutada rotina completa: forcar `publicId`, publicar e sincronizar tenant.
- Validado em tempo real que a URL solicitada (`...-38esudn`) responde `HTTP 200`.
- Fluxo local do tenant continua apontando para o slug solicitado.
- Mantido monitoramento para diferenciar indisponibilidade real vs cache local do navegador.

### Palavras-chave para pesquisa futura

- `recheck-idealcred-404`
- `publicid-publish-sync-verify`
- `viewer-http200-confirmado`

## 2026-04-28 - Cor do botao corrigida para a marca do assinante

- Identificado que o botao permanecia preto porque `defaultChatTheme.userBubbleBg` estava `#000000`.
- Melhorada extracao de cor da logo no Admin para evitar predominancia de tons escuros/fundo.
- Cor da Ideal Cred ajustada e reaplicada no Typebot (`#f7941d`) com sync validado.
- Schema publicado passou a refletir `chat.buttons` e `customCss` na cor correta.

### Palavras-chave para pesquisa futura

- `cor-botao-preto-regressao`
- `extract-logo-color-priorizar-destaque`
- `ideal-cred-f7941d`

## 2026-04-28 - Reaplicacao forcada de avatar e cores em fluxos existentes

- Corrigido gap de sync onde fluxo ja existente podia nao receber novamente avatar e cores do tenant.
- Reaplicacao visual passou a rodar mesmo sem overwrite, incluindo `hostAvatar` e `chat.buttons`.
- Build e sync validados no Ideal Cred com campos visuais presentes no schema publicado.

### Palavras-chave para pesquisa futura

- `avatar-cores-existing-flow-sync`
- `hostavatar-reapply-no-overwrite`
- `chat-buttons-theme-persist`

## 2026-04-28 - Correcao de regressao visual (avatar e cores) apos rotina de publicacao

- Identificada regressao onde avatar/logo e cores do tenant se perdiam apos sync/publicacao.
- Ajustada rotina para nao limpar icon/metadata quando nao houver URL nova segura.
- Implementado fallback para endpoint publico de logo/share-image quando tenant usa `data:image` e houver `TYPEBOT_AVATAR_PUBLIC_BASE_URL`.
- Validado no fluxo Ideal Cred: `hostAvatar` ativo e `buttons`/`customCss` com cores corretas.

### Palavras-chave para pesquisa futura

- `regressao-avatar-cores-pos-sync`
- `preservar-metadata-typebot`
- `public-logo-endpoint-fallback`

## 2026-04-28 - Rotina definitiva de publicacao e acessibilidade pos-import

- Implementada rotina obrigatoria no backend para todo fluxo importado/sincronizado sair operacional.
- A rotina agora forca `publicId` deterministico, publica no Typebot e valida acessibilidade da URL no viewer.
- Adicionado retry automatico (ate 3 tentativas) para confirmacao de disponibilidade.
- Aplicado em importacao, atualizacao de existentes e varredura final de publicacao do workspace.

### Palavras-chave para pesquisa futura

- `garantia-pos-import-publicado-acessivel`
- `ensure-operational-typebot`
- `retry-validacao-viewer`

## 2026-04-28 - URL especifica do fluxo Ideal Cred publicada com slug 38esudn

- Corrigido caso de 404 no link solicitado com slug `...-38esudn`.
- `publicId` do typebot do tenant foi atualizado para `empr-stimo-do-trabalhador-clt-38esudn`.
- Publicacao executada no builder e sync do tenant reprocessado.
- Validado `200 OK` na URL solicitada e `GET /flows` retornando o mesmo link.

### Palavras-chave para pesquisa futura

- `publicid-especifico-ideal-cred`
- `slug-38esudn-publicado`
- `viewer-404-resolvido-com-publish`

## 2026-04-28 - Validacao da URL acessivel da Ideal Cred

- Retomada da investigacao para confirmar URL publica funcional do fluxo Ideal Cred.
- API local foi religada e o sync do tenant executado com sucesso.
- Confirmado `200 OK` para `.../emprestimo-clt` e `404` apenas para slug antigo com sufixo.
- Lista de flows do tenant permanece com URL funcional e pronta para compartilhamento.

### Palavras-chave para pesquisa futura

- `ideal-cred-viewer-url-ok`
- `emprestimo-clt-link-oficial`
- `sync-pos-retomada`

## 2026-04-27 - Publicação forçada com retry e validação de acessibilidade

- Implementada etapa de hardening no sync do tenant para forçar publicação e validar links ativos ao final.
- Nova rotina faz até 3 tentativas: publica workspace completo, recalcula URLs dos flows e revalida acessibilidade.
- Se recuperar links, registra no resumo; se restar fluxo inativo, também registra aviso explícito.
- Objetivo: garantir que fluxo compartilhado esteja visível/acessível imediatamente após sync/import.

### Palavras-chave para pesquisa futura

- `force-publish-until-active`
- `retry-publish-viewer-links`
- `sync-hardening-accessibility`

## 2026-04-27 - Botão "Copiar link" bloqueado para fluxo inativo

- Implementado bloqueio do botão de cópia quando a URL do fluxo não estiver ativa no viewer.
- UI agora só habilita cópia quando `healthStatus === active`; estados `checking` e `inactive` ficam desabilitados.
- A função de cópia também valida status no clique (proteção dupla) e mostra aviso quando indisponível.
- Resultado: evita copiar links quebrados/404 para operação.

### Palavras-chave para pesquisa futura

- `copiar-link-somente-ativo`
- `flow-status-gate-ui-action`
- `no-copy-for-inactive-viewer-url`

## 2026-04-27 - Proteção contra URL quebrada (404) no link do fluxo

- Investigado erro de carregamento no viewer para slug com sufixo (`...-38esudn`): URL respondia 404.
- Implementada validação de URL ativa antes de persistir links no fluxo do tenant.
- Quando URL derivada estiver inativa, o sync aplica fallback para URL ativa e evita salvar link quebrado.
- Resultado validado: painel passou a retornar URL funcional (`.../emprestimo-clt`) em vez da quebrada.

### Palavras-chave para pesquisa futura

- `avoid-saving-404-viewer-url`
- `viewer-active-url-validation`
- `fallback-url-on-broken-tenant-slug`

## 2026-04-27 - Varredura final de publicação no workspace do tenant

- Para eliminar draft residual, o sync do tenant agora faz varredura final e publica todos os typebots do workspace.
- Implementada função dedicada para listar e publicar cada fluxo ao fim de `syncSystemDefaultsToRealTypebotWorkspace`.
- `syncSummary` passou a registrar explicitamente quais fluxos receberam publicação final garantida.
- Validação no Ideal Cred confirmou execução da etapa de fechamento de publicação.

### Palavras-chave para pesquisa futura

- `workspace-publish-sweep`
- `sync-final-publish-guarantee`
- `eliminar-draft-residual-typebot`

## 2026-04-27 - Hardening da publicação automática no sync do tenant

- Investigado caso onde o Builder ainda mostrava "Publicar" mesmo após sync.
- Confirmado que endpoint de publish funciona, mas alguns caminhos aplicavam patch sem publish final garantido.
- Ajustado `typebot-builder.service.ts` para publicar:
  - após patch de ícone bem-sucedido;
  - ao final de cada fluxo importado;
  - ao final de cada fluxo existente atualizado no sync.
- Resultado: ciclo de sync fecha com estado publicado no tenant, reduzindo chance de draft residual.

### Palavras-chave para pesquisa futura

- `publish-final-after-sync`
- `builder-showing-publicar-after-automation`
- `draft-residual-fix-typebot`

## 2026-04-27 - Rotina de publicação imediata após import no tenant

- Implementada regra única: todo fluxo importado no workspace do assinante agora é publicado imediatamente após o import.
- A publicação foi centralizada em `importTypebotIntoTargetWorkspace`, reduzindo risco de fluxo ficar em draft por caminho alternativo.
- Chamadas duplicadas de publish nos loops de sync foram removidas para evitar redundância e manter comportamento consistente.
- Build e sync de validação executados com sucesso.

### Palavras-chave para pesquisa futura

- `publish-after-import-tenant`
- `typebot-import-draft-prevention`
- `centralizar-publicacao-import`

## 2026-04-27 - Copiar link agora usa URL do tenant (não Walkup)

- Corrigido o problema da Etapa 3 no painel do assinante onde a URL exibida/copied podia ficar com slug da matriz.
- Ajustada a rotina de sync para não depender de `publicId` quando a Builder API retorna `null` no draft.
- Passou a casar o typebot por nome e derivar a URL pelo `id` do typebot no workspace do tenant (sufixo final correto).
- Incluída limpeza de flows locais duplicados/obsoletos durante sync forçado para evitar fallback em links antigos.
- Validação na Ideal Cred: CLT retornou `.../empr-stimo-do-trabalhador-clt-38esudn` (esperado) e SIAPE com sufixo do tenant.

### Palavras-chave para pesquisa futura

- `copiar-link-tenant-correto`
- `publicid-null-typebot-draft`
- `viewer-url-por-id-do-tenant`
- `limpeza-duplicados-flow-local`

## 2026-04-27 - Novo padrão sem mapa agora importa automaticamente

- Falha identificada: ao promover novo padrão sem entrada no `TYPEBOT_DEFAULT_IMPORTS_MAP`, o sync ignorava o fluxo.
- Implementado fallback para resolver `sourceTypebotId` por nome/título no workspace matriz (`TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`).
- Com isso, novos padrões promovidos passam a importar sem depender de map manual prévio.
- Validação na Ideal Cred: workspace refletiu os 2 padrões ativos (CLT + FGTS).

### Palavras-chave para pesquisa futura

- `source-id-fallback-by-title`
- `default-import-without-map`
- `promote-new-default-import-fix`

## 2026-04-27 - Espelhamento estrito de padrões no workspace do assinante

- Corrigido desvio onde workspace do assinante mantinha flows além dos padrões ativos da Biblioteca Master.
- Sync forçado (`overwriteExisting=true`) agora opera em modo estrito: remove todos os flows fora da lista de padrões ativos.
- `promote` passou a disparar sync com `overwriteExisting=true` para refletir na hora.
- Importação em massa da matriz foi desligada por padrão (`TYPEBOT_IMPORT_FULL_SOURCE_WORKSPACE=false`), evitando recontaminação.
- Validado na Ideal Cred: workspace ficou com apenas 1 flow (o único padrão ativo).

### Palavras-chave para pesquisa futura

- `strict-default-mirror`
- `prune-non-default-typebots`
- `promote-overwrite-existing`
- `disable-full-source-import-default`

## 2026-04-27 - Correção da falha de import após promote (metadata null)

- Investigação em logs confirmou falha no import de padrão com erro 400 da Builder API.
- Causa: `settings.metadata.imageUrl` e `settings.metadata.favIconUrl` enviados como `null`; Typebot exige `string`.
- Correção aplicada em `typebot-builder.service.ts`: fallback para `""` nesses campos.
- Revalidação do endpoint `sync-defaults` da Ideal Cred concluída com `status: ok`.

### Palavras-chave para pesquisa futura

- `import-400-metadata-null`
- `favIconUrl-imageUrl-string-required`
- `sync-defaults-retry-ok`

## 2026-04-27 - Promote para padrão agora sincroniza Typebot na hora

- Corrigido fluxo de `Definir como padrão`: antes reaproveitava só propagação local e podia não importar imediatamente no workspace Typebot.
- `POST /api/master/system-library/promote` agora dispara sync imediato para todos os assinantes (`syncSystemDefaultsToRealTypebotWorkspace`).
- Efeito: ao remover e promover novamente, o fluxo volta a ser importado sem depender de rotina indireta.
- Build e lint validados.

### Palavras-chave para pesquisa futura

- `promote-default-immediate-sync`
- `reimport-after-repromote`
- `system-library-promote-typebot`

## 2026-04-27 - Remocao em cascata ao tirar padrão da Biblioteca Master

- Identificado gap: remover item da Biblioteca Master apagava apenas o registro local, sem remover dos assinantes.
- Implementada cascata completa no `DELETE /api/master/system-library/:id`:
  - remove flows correspondentes da base local dos tenants;
  - remove typebots equivalentes dos workspaces Typebot dos assinantes.
- Incluida busca por item da biblioteca por `id` para garantir contexto de remocao antes do delete.
- Build e lint validados sem erros.

### Palavras-chave para pesquisa futura

- `delete-library-item-cascade`
- `remove-default-flow-all-tenants`
- `typebot-delete-on-master-remove`
- `system-master-library-by-id`

## 2026-04-27 - Rotina automatica: logo do assinante reaplica avatar

- Revisada a rotina solicitada (cadastro tenant/workspace, importacao de padrões e avatar por logo).
- Confirmado que cadastro de assinante e importacao de flows padrão ja existiam.
- Implementado gatilho faltante: ao salvar `profileImageUrl` no tenant (`PATCH /profile-image`), o backend dispara sync com `overwriteExisting: true`.
- Efeito: quando o assinante define logo depois, o avatar dos flows é atualizado automaticamente sem ação manual.
- Se o assinante nao tiver logo, o sistema preserva avatar padrão do Typebot.

### Palavras-chave para pesquisa futura

- `profile-image-trigger-sync`
- `auto-avatar-after-logo-set`
- `tenant-workspace-default-import`
- `overwriteExisting-true-profile-update`

## 2026-04-27 - Hotfix de avatar no `hostAvatar` (Ideal Cred)

- Com o bug do topo resolvido, o avatar ainda não aparecia no preview dos flows.
- Hotfix operacional aplicado direto na Builder API para os 5 flows da Ideal Cred:
  - `theme.chat.hostAvatar.isEnabled=true`
  - `theme.chat.hostAvatar.url=<logo do tenant>`
- Validado retorno de API com `enabled: true` e URL presente em todos os flows.

### Palavras-chave para pesquisa futura

- `hostavatar-hotfix`
- `ideal-cred-avatar-preview`
- `theme.chat.hostAvatar`

## 2026-04-27 - Fix definitivo do base64 no topo do Typebot

- Regressao confirmada: o topo do Builder voltava a exibir base64 quando `typebot.icon` recebia `data:image`.
- Regra final implementada: `typebot.icon` nao aceita mais data URI (somente URL http(s) ou vazio).
- Limpeza operacional aplicada na Ideal Cred: todos os flows com `typebot.icon=""`.
- Sync reaplicado apos limpeza para manter tema/metadados sem sujar o header.
- Separacao de responsabilidade mantida: avatar visual do chat usa `hostAvatar`; identificacao do flow/topo usa `typebot.icon` limpo.

### Palavras-chave para pesquisa futura

- `typebot-icon-clean`
- `no-datauri-header`
- `hostavatar-vs-typebot-icon`
- `ideal-cred-base64-fix`

## 2026-04-27 - Avatar no Builder corrigido via `typebot.icon` data URI

- Diagnostico final: URL `.../api/public/tenants/:id/logo` no dominio do Builder retornava 404, entao o avatar nao carregava.
- Correcao aplicada: `typebot.icon` dos fluxos da Ideal Cred foi forcado para a `data:image` da logo do tenant.
- Protecao mantida: `workspace.icon` continua saneado para nao quebrar o seletor superior.
- Sync passou a reaplicar icon por tenant explicitamente em fluxos existentes/importados.
- Validado na API do Typebot que os flows da Ideal Cred ficaram com `icon` em `data:image/png;base64,...`.

### Palavras-chave para pesquisa futura

- `typebot-icon-datauri-avatar`
- `builder-avatar-404`
- `workspace-select-safe`
- `applyTenantIconOnTarget`

## 2026-04-27 - Fix de concorrencia no Builder (auto-sync sobrescrevendo edicao)

- Causa raiz do erro `Could not update the typebot` identificada: auto-sync reaplicava patch em flows existentes enquanto usuario editava no Builder.
- Ajustado `syncSystemDefaultsToRealTypebotWorkspace` para nao sobrescrever fluxos ja existentes no workspace durante o loop de sync.
- Comportamento novo: auto-sync continua importando faltantes e preserva o que estiver em edicao manual.
- Build da API validado com sucesso.

### Palavras-chave para pesquisa futura

- `typebot-save-conflict`
- `auto-sync-no-overwrite`
- `existing-flow-preservation`
- `builder-concurrency-fix`

## 2026-04-27 - Reforco anti-regressao no avatar por logo do tenant

- Trabalho de avatar foi refeito mantendo a regra: avatar do bot deve vir da logo do assinante.
- Adicionada sanitizacao defensiva para impedir `data:image...` em campos textuais do Typebot (workspace/flow/metadata textuais).
- Criados guards em `typebot-builder.service.ts` para fallback seguro quando entrada estiver em formato de data URI.
- Mantida a limpeza automatica de `workspace.icon` em `data:image...` para evitar quebra do seletor superior.
- Tenant Ideal Cred foi sincronizado novamente com as novas protecoes.

### Palavras-chave para pesquisa futura

- `avatar-tenant-logo-hardening`
- `sanitizeTypebotText`
- `workspace-icon-autoclean`
- `anti-dataimage-regression`

## 2026-04-27 - Fix do select de workspace com `data:image...`

- Causa raiz confirmada: o campo `workspace.icon` no Typebot estava com `data:image...`, e nao o nome do workspace.
- Limpeza aplicada no workspace Ideal Cred para remover o icon corrompido.
- Backend recebeu saneamento automatico no sync (`sanitizeWorkspaceIconOnTarget`) para impedir recorrencia.
- Regra aplicada: quando `workspace.icon` vier em `data:image`, o sistema limpa para string vazia mantendo nome seguro.
- Re-sync do tenant Ideal Cred concluido com sucesso apos ajuste.

### Palavras-chave para pesquisa futura

- `workspace-icon-data-image`
- `typebot-workspace-select-bug`
- `sanitizeWorkspaceIconOnTarget`
- `ideal-cred-workspace-cleanup`

## 2026-04-27 - Fix do seletor de workspace sem remover upload de avatar

- Causa raiz tratada: `data:image...` em campos do Typebot Builder podia quebrar o topo e impedir uso do seletor de workspace.
- Upload no painel foi mantido: tenant continua podendo salvar logo/imagem de compartilhamento via upload (`data:image`).
- No sync/import, o backend passou a enviar para o Typebot apenas URL `http(s)`:
  - avatar do bot (`theme.chat.hostAvatar.url`)
  - metadados (`settings.metadata.favIconUrl` e `settings.metadata.imageUrl`)
- Criado endpoint publico para imagem de compartilhamento: `GET /api/public/tenants/:id/share-image`.
- Build da API validado com sucesso.

### Palavras-chave para pesquisa futura

- `workspace-select-typebot-fix`
- `sem-data-image-no-builder`
- `public-share-image-endpoint`
- `upload-avatar-preservado`

## 2026-04-24 - Cor predominante da logo aplicada em botões do Typebot no sync

- Cor predominante já extraída no admin (`defaultChatTheme.userBubbleBg`) passou a ser aplicada automaticamente nos botões do Typebot durante sync/import.
- Implementada rotina dedicada no backend para atualizar `theme.customCss` com bloco idempotente `.typebot-button` (fundo, borda e contraste de texto).
- Rotina integrada para fluxos existentes e importados, seguida de publicação automática do fluxo.
- Corrigido bloqueio operacional de validação (API em watch sem subir por `EADDRINUSE` na porta 3333), com restart do processo correto.
- Validação real no tenant Ideal Cred confirmou `theme.customCss` com marcador `drax-auto-button-theme:start`.

### Palavras-chave para pesquisa futura

- `logo-dominant-color-typebot-buttons`
- `defaultChatTheme-userBubbleBg`
- `theme-customCss-typebot-button`
- `drax-auto-button-theme`

## 2026-04-24 - Fix de avatar quebrado por endpoint remoto 404

- Diagnostico fechado: avatar quebrado porque `hostAvatar.url` estava apontando para endpoint remoto `.../api/public/tenants/:id/logo` inexistente (`404`).
- Ajuste em `typebot-builder.service.ts`: removido fallback automatico de URL publica via `TYPEBOT_SYSTEM_MASTER_URL`.
- Novo comportamento: usa URL publica somente se configurada explicitamente; caso contrario, fallback para `data:image` valido no `hostAvatar.url`.
- Logo da Ideal Cred reaplicada via API de tenant e sincronizacao dos fluxos executada apos reinicio da API.
- Validacao final no Builder API: `hostAvatar.isEnabled=true` e `hostAvatar.url` com `data:image/png;base64,...` (~5KB).

### Palavras-chave para pesquisa futura

- `avatar-broken-remote-404`
- `hostavatar-datauri-fallback`
- `remove-system-master-url-avatar-fallback`
- `ideal-cred-logo-resync`

## 2026-04-24 - Fix de avatar corrompido com URL publica da API

- Causa raiz operacional confirmada: avatar quebrava quando `hostAvatar.url` usava fonte instavel/inacessivel (ex.: localhost no remoto) ou `data:image` grande.
- `typebot-builder.service.ts` passou a montar URL publica estavel por tenant (`/api/public/tenants/:id/logo`) para `theme.chat.hostAvatar.url`.
- Removido fallback padrao para `http://localhost:3333` em `TYPEBOT_AVATAR_PUBLIC_BASE_URL`.
- `hostAvatar.url` deixa de receber `data:image` direto no Theme, reduzindo risco de corrupcao e estouro visual no editor.
- Build da API validado com sucesso.

### Palavras-chave para pesquisa futura

- `fix-avatar-corrompido-url-publica-api`
- `hostavatar-sem-dataurl`
- `TYPEBOT_AVATAR_PUBLIC_BASE_URL-sem-localhost`
- `api-public-tenants-logo`

## 2026-04-24 - Metadados de fluxo Typebot aplicados por tenant no import

- Importacao de fluxos para workspace do assinante passou a injetar metadados do tenant no schema do Typebot.
- Campos aplicados automaticamente: `icon` (logo), `image` (compartilhamento), `description` (descricao da empresa) e `title` do fluxo.
- Aplicacao feita em campos diretos do schema e tambem em `settings.metadata` para compatibilidade com a tela Metadados.
- Cobertura para importacao de fluxos padrao e importacao em massa da matriz.
- Build da API validado.

### Palavras-chave para pesquisa futura

- `sync-metadados-typebot-tenant`
- `settings.metadata.icon-image-description`
- `import-typebot-com-metadados`

## 2026-04-24 - Perfil de Atendimento com metadados de compartilhamento

- Etapa `Perfil de atendimento` recebeu dois novos campos: `Imagem (Compartilhamento)` e `Descricao` (max 200).
- Backend de tenant passou a persistir `shareImageUrl` e `shareDescription`.
- Endpoint `PATCH /api/master/tenants/:id/profile-image` passou a aceitar os novos campos com validacao.
- Frontend inclui contador de caracteres e recomendacao de tamanho da imagem: `1200x630` (1.91:1).
- Build da API e do Admin validados.

### Palavras-chave para pesquisa futura

- `perfil-atendimento-metadados-compartilhamento`
- `shareImageUrl-shareDescription-tenant`
- `descricao-200-caracteres`
- `imagem-og-1200x630`

## 2026-04-24 - Correcao URL Cartao Consignado (Ideal Cred)

- Aplicado override deterministico por `librarySourceId` no sync de viewer URL para corrigir caso legado do fluxo `Cartao Consignado`.
- Mapeamento fixado: `b2ad8248-3fe8-4fcd-88e5-41bf45582b38` -> `cart-o-consignado-0yjx8jh`.
- Persistencia local (`saved-flows.json`) atualizada para refletir a URL correta imediatamente.
- Validado via API do tenant Ideal Cred que o fluxo agora retorna `.../cart-o-consignado-0yjx8jh`.

### Palavras-chave para pesquisa futura

- `fix-ideal-cred-cartao-consignado-url`
- `librarysourceid-url-override`
- `cart-o-consignado-0yjx8jh`

## 2026-04-23 - Admin: Acesso Typebot só Master do Sistema (URL matriz)

- Removido `Acessar Typebot` da tabela de assinantes.
- Header `Acesso Typebot` visivel apenas com `masterProfile === system_master`; abre nova aba na URL fixa do builder matriz (`/pt-BR/typebots`).
- Modal tutorial de primeiro acesso Typebot removido (fluxo antigo).

### Palavras-chave para pesquisa futura

- `acesso-typebot-walkup-header`
- `sem-typebot-btn-linha-assinante`

## 2026-04-23 - Filtro "somente fluxos ativos" no import Typebot

- `isFlowUrlActive` centralizado em `apps/api/src/lib/flow-url-health.ts` e reutilizado por `flow.routes` e `typebot-builder.service`.
- `TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE` (default `true`): import padrao exige `viewerUrl` 2xx; import matriz em massa exige URL `{TYPEBOT_SOURCE_VIEWER_BASE_URL}/{publicId}` 2xx.
- Com matriz em massa + filtro ativo, `TYPEBOT_SOURCE_VIEWER_BASE_URL` e obrigatorio.
- Resumo de sync inclui listas de ignorados por inatividade.

### Palavras-chave para pesquisa futura

- `import-typebot-somente-ativos`
- `TYPEBOT_SOURCE_VIEWER_BASE_URL`
- `flow-url-health`

## 2026-04-23 - Import matriz Walkup (self-host) para workspace cloud (Ideal Cred)

- Backend suporta **fonte** e **destino** Builder API distintos (`TYPEBOT_SOURCE_*` / `TYPEBOT_TARGET_*`).
- Com `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`, o sync lista todos os typebots do workspace matriz na fonte e importa no workspace do tenant no destino (idempotente por nome).
- Token de destino em host diferente da fonte e **obrigatorio** (`TYPEBOT_TARGET_BUILDER_API_TOKEN`); nao reutiliza o token da Walkup.
- Tenant `Ideal Cred` aponta workspace cloud `cmobozu52000b04jmdwcvxda2` e URL de acesso em `app.typebot.com`.
- Rota `sync-defaults` aceita rodar so com import da matriz (sem itens `isSystemDefault` na biblioteca).

### Palavras-chave para pesquisa futura

- `walkup-selfhost-to-app-typebot-com`
- `TYPEBOT_SOURCE_MASTER_WORKSPACE_ID`
- `TYPEBOT_TARGET_PUBLIC_BASE_URL`

## 2026-04-23 - Idempotencia no import de Typebot (evita duplicar CLT)

- Sync de defaults passou a listar typebots existentes no workspace antes de importar.
- Comparacao por nome normalizado (lowercase/trim) para evitar reimport de itens ja presentes.
- Resumo de sync agora separa: `Importados`, `Já existentes no workspace` e `Ignorados`.
- Build da API validado apos ajuste.

### Palavras-chave para pesquisa futura

- `idempotencia-import-clt`
- `list-workspace-typebots-before-import`
- `ja-existentes-no-workspace`

## 2026-04-23 - Automacao Typebot sem token por assinante (token unico da matriz)

- Removido default de Builder API para `app.typebot.com` no backend.
- Provisionamento agora exige `TYPEBOT_BUILDER_API_BASE_URL` explicito no ambiente.
- Tenant nao e mais marcado como `provisioned` sem workspace/URL real.
- Criacao de tenant inicia em `not_started` e depende de sync real para provisionar.
- Admin nao abre mais fallback generico de cloud quando nao existe URL provisionada; mostra aviso para rodar sync.
- Build validado em `api` e `admin`.

### Palavras-chave para pesquisa futura

- `token-unico-matriz-typebot`
- `sem-token-por-assinante`
- `not-started-ate-sync`
- `no-cloud-fallback-admin`

## 2026-04-23 - Sync do fluxo CLT confirmado no workspace da Ideal Cred

- API local iniciada para executar sincronizacao do tenant `Ideal Cred`.
- Endpoint `POST /api/master/tenants/:id/typebot/sync-defaults` executado com retorno `status: ok`.
- Workspace alvo validado: `cmobv9atd000dru1co89jxfzb`.
- Confirmacao direta no Builder API listando typebots do workspace com itens `CLT` presentes.

### Palavras-chave para pesquisa futura

- `sync-clt-ideal-cred-ok`
- `builder-api-list-typebots-workspace`
- `cmobv9atd000dru1co89jxfzb-clt`

## 2026-04-23 - Ajuste completo de env + sync Typebot do Mozart validado

- `TYPEBOT_BUILDER_API_BASE_URL` consolidado para o builder self-hosted (`...easypanel.host/api`).
- `TYPEBOT_DEFAULT_IMPORTS_MAP` atualizado com `sourceTypebotId` real do fluxo CLT (`cj2c08vhgb1vecbncm28n80m`).
- Identificado bloqueio de `create workspace` por nome duplicado (`Ideal Cred`) e vinculacao do tenant ao workspace existente (`cmobv9atd000dru1co89jxfzb`).
- Sync final executado com sucesso via endpoint de tenant:
  - `status: ok`
  - `syncSummary: Importados: CLT.`

### Palavras-chave para pesquisa futura

- `env-typebot-selfhost-consolidado`
- `sourceTypebotId-clt-real`
- `mozart-sync-defaults-ok`
- `workspace-ideal-cred-existente`

## 2026-04-23 - Builder API apontado para self-host (401 resolvido)

- Token testado diretamente no endpoint self-host `.../api/v1/workspaces` com retorno `200`.
- `TYPEBOT_BUILDER_API_BASE_URL` ajustado para `https://soma-typebot-walkup-builder.achpyp.easypanel.host/api`.
- Sync do tenant `mozart.hotmart@gmail.com` deixou de falhar por `401`.
- Novo retorno: `Falha ao obter typebot fonte SOURCE_TYPEBOT_ID_CLT (404)`.
- Conclusao: autenticacao/endpoint corretos; falta trocar o placeholder pelo ID real do typebot fonte.

### Palavras-chave para pesquisa futura

- `builder-api-selfhost-ok`
- `source_typebot_id_clt-404`
- `typebot-default-imports-map`

## 2026-04-23 - Validacao final de token Builder API (401 em .io e .com)

- `.env` da API foi ajustado para `TYPEBOT_BUILDER_API_BASE_URL=https://app.typebot.io/api`.
- API reiniciada e sync do tenant `mozart.hotmart@gmail.com` reexecutado.
- Endpoint continuou retornando `Falha ao criar workspace Typebot (401)`.
- Teste direto com o mesmo `Authorization: Bearer <token>` em `/v1/workspaces` retornou `401` tanto em `app.typebot.io` quanto `app.typebot.com`.
- Conclusao: bloqueio atual esta no token/permissoes/conta no provedor Typebot, nao no codigo local.

### Palavras-chave para pesquisa futura

- `builder-api-401-io-com`
- `typebot-token-permission`
- `workspace-create-unauthorized`

## 2026-04-23 - Diagnostico do token Builder API (erro 401)

- Validado que o `.env` de `apps/api` esta preenchido e atualizado no disco.
- API reiniciada e endpoint de sync executado para o tenant `mozart.hotmart@gmail.com`.
- Erro evoluiu de `token nao configurado` para `Falha ao criar workspace Typebot (401)`.
- Conclusao: variavel esta sendo lida; falha atual e de autorizacao/permissao do token no provedor Typebot.

### Palavras-chave para pesquisa futura

- `typebot-builder-token-401`
- `sync-defaults-unauthorized`
- `builder-api-workspace-create-401`

## 2026-04-23 - Rotina automatica para importar fluxo no workspace real Typebot

- Criado servico backend para sync no workspace real do Typebot usando Builder API.
- Na criacao de tenant, sistema agora pode criar workspace real e importar flows padrao automaticamente.
- Integracao usa token/endpoint no servidor (sem exposicao no frontend).
- Adicionado `TYPEBOT_DEFAULT_IMPORTS_MAP` para mapear item padrao interno para `sourceTypebotId` real.
- Em falha de sync real, tenant continua criado e status registra erro operacional para diagnostico.

### Palavras-chave para pesquisa futura

- `auto-import-workspace-real-typebot`
- `typebot-builder-api-sync`
- `TYPEBOT_DEFAULT_IMPORTS_MAP`

## 2026-04-23 - Autoimport de fluxo padrao em novos tenants

- Criacao de assinante (`POST /api/master/tenants`) passou a aplicar automaticamente os itens `isSystemDefault` da Biblioteca Master no tenant novo.
- Ajuste implementado em `tenant.routes` usando `FlowService` + `system-master-library`.
- Validacao real confirmou import automatico do fluxo `CLT` (`.../emprestimo-clt`) em tenant novo.
- Tenant de teste criado apenas para validacao e removido ao final.

### Palavras-chave para pesquisa futura

- `auto-import-fluxo-padrao`
- `novo-tenant-default-flow`
- `system-library-isSystemDefault`

## 2026-04-23 - Modal tutorial de primeiro acesso Typebot

- Modal `Acesso Typebot` evoluido para formato tutorial completo com 3 passos guiados.
- Adicionado mock visual da tela de onboarding com destaque dos botoes `I agree` e `Skip >`.
- Bloco final de atencao mantido com e-mail do assinante usado no primeiro acesso.
- Fluxo de acao preservado: `Copiar e-mail` e `Comecar acesso` liberado apos copia.
- Ajustes visuais aplicados no CSS para reproduzir o layout solicitado.

### Palavras-chave para pesquisa futura

- `modal-tutorial-typebot`
- `primeiro-acesso-typebot`
- `copy-email-gate-cta`

## 2026-04-23 - Acesso Typebot guiado para gerente/master

- Adicionado botao discreto `Acesso Typebot` no topo direito (ao lado do menu de usuario).
- Visivel somente para perfis de atendente `master` e `manager`.
- Clique abre modal de atencao com e-mail do assinante para primeiro acesso.
- Fluxo exige `Copiar e-mail` antes de liberar o botao `Acesso Typebot` no modal.
- Link aberto usa URL de ambiente Typebot do tenant logado/selecionado.

### Palavras-chave para pesquisa futura

- `acesso-typebot-gerente-master`
- `copy-email-before-typebot-access`
- `top-header-typebot-link`

## 2026-04-23 - Exclusao completa do assinante Ideal Cred (mozart hotmart)

- Tenant `Ideal Cred` (`ownerEmail: mozart.hotmart@gmail.com`) removido por endpoint oficial.
- ID excluido: `ee82a83d-df8b-4c22-a224-3425e7f325b0`.
- Validado que API nao retorna mais esse assinante.
- Sem ocorrencias residuais em `tenants.json` e `attendants.json`.

### Palavras-chave para pesquisa futura

- `delete-completo-ideal-cred`
- `cleanup-tenant-mozart-hotmart`
- `tenant-remove-api`

## 2026-04-23 - Senha inicial no cadastro de assinante + envio no e-mail

- `POST /api/master/tenants` passou a exigir `initialPassword`.
- Criacao de tenant agora tambem cria automaticamente o usuario master inicial (`username = ownerEmail`) no modulo de atendentes.
- Senha inicial e hasheada com `scrypt` e usada no e-mail de boas-vindas do assinante.
- Modal de criacao no admin recebeu campo `Senha inicial de acesso` (obrigatorio apenas na criacao).
- Validacao de unicidade global do login do owner para evitar conflitos de autenticacao.

### Palavras-chave para pesquisa futura

- `senha-inicial-assinante`
- `owner-master-auto-create`
- `welcome-email-initial-password`
- `post-tenants-initialPassword`

## 2026-04-23 - Feedback visual no cadastro de assinante (processando)

- Modal de assinante agora exibe estado visual durante criacao/edicao.
- Adicionado `isSavingSubscriber` para bloquear inputs/botoes durante envio.
- Indicador animado exibido com texto `Processando cadastro do assinante...`.
- Botao principal passa a mostrar `Criando...` ou `Salvando...` enquanto processa.
- Linter validado sem erros.

### Palavras-chave para pesquisa futura

- `loading-criacao-assinante`
- `feedback-processando-modal-assinante`
- `isSavingSubscriber`

## 2026-04-23 - Exclusao completa de assinantes duplicados Ideal Cred

- Identificados 2 tenants duplicados `Ideal Cred` (`ownerEmail: mozart.hotmart@gmail.com`) na API em runtime.
- Exclusao executada via endpoint oficial `DELETE /api/master/tenants/:id` para os IDs duplicados.
- Validacao posterior confirmou que `GET /api/master/tenants` nao retorna mais `Ideal Cred`.
- Conferencia em persistencia local tambem sem ocorrencias restantes de `Ideal Cred`/`mozart.hotmart@gmail.com`.

### Palavras-chave para pesquisa futura

- `delete-assinante-ideal-cred`
- `tenant-duplicado-remocao`
- `cleanup-mozart-hotmart-tenant`

## 2026-04-23 - Padronizacao dos e-mails de boas-vindas (assinante e atendente)

- Templates de boas-vindas unificados com o novo texto padrao solicitado.
- E-mail de atendente envia `username`, senha inicial e link de login.
- E-mail de assinante passou a reutilizar o template de credenciais com `ownerEmail` como usuario.
- URL de login padronizada por variavel de ambiente `SYSTEM_LOGIN_URL` com fallback local.
- Linter validado sem erros nos arquivos alterados.

### Palavras-chave para pesquisa futura

- `template-padrao-boas-vindas`
- `welcome-email-assinante-atendente`
- `SYSTEM_LOGIN_URL`
- `mail-templates-unificados`

## 2026-04-23 - Feedback visual de processamento para assinantes e atendentes

- Estados de loading adicionados no frontend para carregamento de assinantes e atendentes.
- `loadTenants` e `loadAttendants` passaram a controlar loading com `try/finally` e validacao de `response.ok`.
- Interface agora exibe indicador animado + texto durante processamento nas duas telas.
- Objetivo: reduzir percepcao de travamento e melhorar clareza de estado.

### Palavras-chave para pesquisa futura

- `loading-tenants`
- `loading-attendants`
- `processing-feedback-admin-ui`

## 2026-04-23 - Validacao estrita de aceite SMTP no boas-vindas

- Fluxo de envio de boas-vindas passou a validar aceite real do destinatario (`accepted`) antes de marcar como `sent`.
- `mail.service` agora retorna metadados tecnicos de entrega (`messageId`, `accepted`, `rejected`, `response`).
- `attendant.routes` passou a retornar mensagem de diagnostico operacional no `emailDelivery`.
- Teste real com `mozart.pmo@gmail.com` validou status `sent` com `messageId`.

### Palavras-chave para pesquisa futura

- `smtp-accepted-strict`
- `emailDelivery-messageId`
- `boas-vindas-validacao-entrega`

## 2026-04-23 - Correcao do nome no e-mail de boas-vindas

- Fluxo de cadastro de atendente ajustado para usar o nome persistido no cadastro ao montar o e-mail de boas-vindas.
- `recipientName` agora e resolvido a partir do registro salvo (`displayName`) no tenant.
- Fallback para `username` somente quando o nome vier vazio.
- Validacao de linter sem erros.

### Palavras-chave para pesquisa futura

- `fix-recipient-name-email`
- `nome-cadastro-no-email`
- `attendant-routes-welcome-template`

## 2026-04-23 - Exclusao do tenant Ideal Cred para reset de teste

- Criado endpoint oficial `DELETE /api/master/tenants/:id`.
- Implementado `deleteById` no repository de tenants e `delete` no service.
- Validado que a listagem ativa de tenants nao retorna mais `Ideal Cred`.
- Objetivo: permitir novo ciclo de criacao do assinante e Typebot do zero.

### Palavras-chave para pesquisa futura

- `delete-tenant-ideal-cred`
- `delete-endpoint-tenants`
- `reset-ciclo-teste-typebot`

## 2026-04-23 - Limpeza completa do usuario de teste (mozart hotmart)

- Usuario de teste removido dos dados ativos de login via endpoint de exclusao de atendente.
- Tenant `Ideal Cred` atualizado para remover referencia ao e-mail do usuario removido.
- Validacao de autenticacao retornando `401` para o usuario removido.
- Documentacao operacional higienizada para eliminar ocorrencias literais do e-mail.

### Palavras-chave para pesquisa futura

- `cleanup-usuario-teste-mozart`
- `reset-cadastro-typebot`
- `login-401-apos-remocao`

## 2026-04-23 - Remocao do provisionamento manual de Typebot

- Rota manual `POST /api/master/tenants/:id/typebot/provision` removida do backend.
- Metodo de service associado ao provisionamento manual removido.
- Frontend de assinantes removeu o botao `Ativar Typebot`, mantendo apenas `Acessar Typebot`.
- Limpeza de estado/funcoes nao utilizados (`typebotCapabilities`) no `App.tsx`.

### Palavras-chave para pesquisa futura

- `remover-provisionamento-manual-typebot`
- `sem-endpoint-typebot-provision`
- `front-sem-botao-ativar-typebot`

## 2026-04-23 - Typebot auto-ativo para todo assinante

- Regra de criacao de tenant alterada para provisionar Typebot automaticamente para qualquer assinante.
- `GET /api/master/tenants` passou a normalizar retorno de Typebot como `provisioned`, inclusive para registros legados.
- Interface de assinantes removeu acao manual de ativacao e manteve apenas indicador de ativo + botao de acesso.
- Validado retorno do endpoint com `typebotProvisionStatus = provisioned`.

### Palavras-chave para pesquisa futura

- `typebot-auto-ativo`
- `sem-botao-ativar-typebot`
- `tenant-create-provisioned-default`
- `typebotProvisionStatus-provisioned-all`

## 2026-04-23 - Ajuste de rotulo para Master Assinante

- Texto de tipo de usuario alterado de `Master do Assinante` para `Master Assinante`.
- Alteracao aplicada no frontend da tabela de assinantes.
- Validacao de linter sem erros.

### Palavras-chave para pesquisa futura

- `master-assinante`
- `rotulo-tipo-usuario`
- `ajuste-texto-assinantes`

## 2026-04-23 - Tabela de assinantes em uma linha + traducao de rótulos

- Ajustado layout da tabela de assinantes para 4 colunas no desktop (Assinante, Tipo de usuario, Status, Acoes).
- Corrigida quebra visual que jogava parte do cabecalho/acoes para baixo.
- Tipo de usuario traduzido para `Master do Sistema` e `Master do Assinante`.
- Status traduzido de `active/blocked` para `Ativo/Bloqueado`.

### Palavras-chave para pesquisa futura

- `tabela-assinantes-uma-linha`
- `coluna-tipo-usuario`
- `traducao-status-ativo-bloqueado`
- `subscribers-table-row-4-colunas`

## 2026-04-23 - Correcao de tenant no login do usuario de teste

- Validado que o login estava retornando indevidamente o tenant `Walkup`.
- Usuario de teste foi movido para o tenant correto `Ideal Cred`.
- Registro antigo no tenant `Walkup` foi removido para eliminar colisao de contexto.
- Login revalidado com sucesso retornando `masterProfile = subscriber_master` no tenant correto.

### Palavras-chave para pesquisa futura

- `fix-tenant-login-mozart-hotmart`
- `tenant-incorreto-walkup`
- `realocar-usuario-ideal-cred`
- `auth-login-tenantid`

## 2026-04-23 - Diagnostico de boas-vindas para usuario de teste

- Backend de cadastro/SMTP revisado e teste real executado no endpoint de atendentes.
- Resultado validado: `emailDelivery.status = "sent"` para usuario de teste.
- Identificado registro legado `mozart` sem `email` em `attendants.json`, potencial fonte de confusao em testes anteriores.

### Palavras-chave para pesquisa futura

- `mozart-hotmart-email-sent`
- `emailDelivery-status-sent`
- `registro-legado-sem-email`
- `diagnostico-boas-vindas`

## 2026-04-23 - Propagacao automatica de fluxo padrao Master para todos os tenants

- `POST /api/master/system-library/promote` agora distribui automaticamente o fluxo padrao para todos os tenants assinantes.
- Tenant origem `walkup@walkuptec.com.br` e ignorado na copia automatica.
- Adicionado bloqueio de duplicidade por `url` e `librarySourceId`.
- API reiniciada apos deploy local da mudanca.

### Palavras-chave para pesquisa futura

- `propagacao-biblioteca-master`
- `promote-para-todos-tenants`
- `default-flow-auto-distribution`
- `librarySourceId-dedup`

## 2026-04-23 - .env pronto para consumo (Typebot auth/SSO)

- `.env` recebeu bloco completo de autenticacao Typebot com valores preenchidos.
- `TYPEBOT_DEFAULT_DASHBOARD_URL` padronizado para `https://app.typebot.io/typebots`.
- Adicionadas variaveis `TYPEBOT_SSO_*` com defaults seguros para readiness.
- `TYPEBOT_AUTH_MODE` fixado em `manual` ate ativacao real do provedor SSO.

### Palavras-chave para pesquisa futura

- `env-pronto-typebot`
- `TYPEBOT_AUTH_MODE-manual`
- `TYPEBOT_SSO-readiness-default`
- `dashboard-typebots-url`

## 2026-04-23 - Matriz de configuracao SSO Typebot

- Bloco de readiness SSO adicionado no `.env.example` com variaveis padrao para federacao.
- Estruturado checklist de ativacao para reduzir retrabalho na virada de `manual` para `sso`.
- Mantida compatibilidade com o fluxo atual (`TYPEBOT_AUTH_MODE`) ja implementado no backend.

### Palavras-chave para pesquisa futura

- `matriz-sso-typebot`
- `TYPEBOT_SSO_PROVIDER`
- `TYPEBOT_SSO_CALLBACK_URL`
- `checklist-federacao-typebot`

## 2026-04-23 - Capacidade Typebot (SSO / magic link / manual)

- Backend ganhou endpoint `GET /api/master/typebot/capabilities` para expor modo de autenticacao configurado.
- Novo controle por ambiente: `TYPEBOT_AUTH_MODE` (`manual`, `magic_link`, `sso`).
- Admin passou a carregar a capacidade e ajustar feedback no `Ativar Typebot`.
- Fluxo fica preparado para bypass real quando SSO estiver ativo no provedor Typebot.
- API reiniciada apos a alteracao.

### Palavras-chave para pesquisa futura

- `typebot-capabilities`
- `TYPEBOT_AUTH_MODE`
- `sso-magic-link-manual`
- `typebot-bypass-login`

## 2026-04-22 - Typebot com acesso direto por tenant

- Provisionamento Typebot atualizado para suportar URL direta por tenant (`typebotAccessUrl`).
- Quando `TYPEBOT_TENANT_URL_TEMPLATE` esta configurado, o tenant passa para `provisioned` e o botao `Acessar Typebot` abre direto no ambiente.
- Frontend do admin passou a priorizar `typebotAccessUrl` antes de fallback para URLs genericas.
- `.env.example` documentado com template de URL e placeholders (`{tenantSlug}`, `{tenantId}`, `{ownerEmail}`).
- Build validado em `apps/api` e `apps/admin`.

### Palavras-chave para pesquisa futura

- `typebot-acesso-direto-tenant`
- `typebotAccessUrl`
- `TYPEBOT_TENANT_URL_TEMPLATE`
- `provisioned-direto-sem-signup`

## 2026-04-23 - Ocultar usuario logado na lista de atendentes

- Ajustada a Etapa 2 (Atendentes) para nao exibir o proprio usuario logado na tabela.
- Filtragem aplicada por `username` e `email` com base em `authSession.user`.
- Tabela segue exibindo normalmente apenas os demais atendentes do tenant.
- Build do admin validado apos ajuste.

### Palavras-chave para pesquisa futura

- `nao-mostrar-usuario-logado`
- `visible-attendants-filter`
- `somaconecta-lista-atendentes`

## 2026-04-23 - System Master com acesso total nas telas

- Perfil `system_master` passou a visualizar todas as telas do admin.
- Menu do `walkup@walkuptec.com.br` agora inclui: Master Console, Biblioteca Master, Assinantes e Fila ao vivo.
- Lista `allowedScreens` atualizada para liberar navegacao completa ao Master do sistema.
- Build do admin validado apos alteracao.

### Palavras-chave para pesquisa futura

- `system-master-acesso-total`
- `walkup-ver-tudo-admin`
- `menu-all-screens`

## 2026-04-23 - Feedback visual discreto no auto-save de atendente

- Etapa de cadastro de atendente recebeu indicador de processamento discreto durante salvamento automatico.
- Exibicao de ponto animado + texto "Salvando atendente automaticamente..." enquanto `isAutoCreatingAttendant` estiver ativo.
- Indicador some automaticamente ao finalizar o processamento.
- Build do admin validado sem erros.

### Palavras-chave para pesquisa futura

- `autosave-atendente-loading`
- `indicador-processamento-discreto`
- `processing-inline-pulse`

## 2026-04-22 - Fix definitivo de envio de e-mail no cadastro de atendente

- Causa raiz: `mail.service` lia SMTP cedo demais (import-time), gerando `SMTP não configurado` em runtime.
- Refatorado para leitura lazy de ambiente com fallback para `.env` da raiz do monorepo.
- Frontend do admin passou a exibir status real de entrega (`emailDelivery`: sent/failed/skipped) no toast.
- Teste real confirmou `emailDelivery.status = "sent"` para cadastro de atendente.
- Limpeza dos usuarios tecnicos criados para teste (`mozart-test-*`, `mozart-final-*`).

### Palavras-chave para pesquisa futura

- `fix-definitivo-email-atendente`
- `mailservice-import-time-env`
- `emaildelivery-toast-admin`

## 2026-04-22 - Correcao definitiva de contraste do select (admin)

- Ajuste no `apps/admin/src/styles.css` para forcar contraste alto em `select option` no Windows.
- Opcoes do dropdown: fundo claro + texto escuro; destaque azul claro para item selecionado.
- Fix aplicado na etapa de atendentes (Master Console) e refletido globalmente nos selects do admin.
- Build do admin validado apos ajuste.

### Palavras-chave para pesquisa futura

- `select-option-contrast-definitivo`
- `admin-windows-dropdown`
- `atendentes-select-legibilidade`

## 2026-04-22 - Correcao do fluxo de cadastro + limpeza do usuario mozart

- Criacao de atendente passou a retornar `emailDelivery` (`sent`, `failed`, `skipped`) para diagnostico claro do envio.
- Tentativa de cadastro duplicado no mesmo tenant agora retorna `409` (conflito) com mensagem explicita.
- Limpeza solicitada executada: removidos registros de `mozart.pmo@gmail.com` para novo teste limpo.
- Build da API validado apos ajuste.

### Palavras-chave para pesquisa futura

- `emaildelivery-cadastro-atendente`
- `duplicate-attendant-409`
- `cleanup-mozart-pmo`

## 2026-04-22 - Diagnostico de e-mail nao recebido no cadastro de atendente

- Verificado que o usuario informado no teste nao estava persistido na base no momento inicial.
- Criacao via API confirmada com `201` para `mozart.pmo@gmail.com`.
- SMTP validado com `verify()` e envio direto testado com aceite Gmail (`250 2.0.0 OK`).
- Conclusao: sem persistencia do usuario nao ha disparo; envio SMTP do projeto esta operacional.

### Palavras-chave para pesquisa futura

- `email-atendente-nao-recebido`
- `smtp-verify-ok`
- `usuario-nao-persistido`

## 2026-04-22 - Integracao Gmail para envio de acesso e redefinicao

- Criado servico de e-mail SMTP com `nodemailer` usando variaveis de ambiente (`MAIL_*`, `SMTP_*`).
- Cadastro de atendente agora dispara e-mail de boas-vindas com usuario e senha inicial.
- Redefinicao de senha agora dispara e-mail de confirmacao para o e-mail validado do usuario.
- Integracao feita de forma desacoplada com templates em modulo proprio (`mail.service` + `mail.templates`).
- Build da API validado apos a integracao.

### Palavras-chave para pesquisa futura

- `gmail-nodemailer-drax`
- `email-boas-vindas-atendente`
- `email-reset-password`
- `mail-service-smtp`

## 2026-04-22 - Senha do master walkup registrada

- Usuario `walkup@walkuptec.com.br` foi registrado na base de atendentes como `master` do tenant Walkup.
- Senha aplicada com hash `scrypt` + salt.
- API reiniciada para recarregar cache e login validado com HTTP 200.

### Palavras-chave para pesquisa futura

- `walkup-master-senha`
- `walkup-login`
- `attendants-master-walkup`

## 2026-04-22 - Registro de senha para somaconecta

- Usuario `somaconecta@gmail.com` foi registrado na base de atendentes como `master` do tenant correspondente.
- Senha aplicada via hash `scrypt` com salt, sem armazenamento em texto puro.
- Cadastro persistido em `apps/api/data/attendants.json`.

### Palavras-chave para pesquisa futura

- `somaconecta-master-login`
- `set-senha-somaconecta`
- `attendants-json-master`

## 2026-04-22 - Login + redefinicao por e-mail cadastrado

- Criada tela de login no admin com `Usuario`, `Senha` e acao `Redefinir senha`.
- Implementados endpoints de autenticacao na API:
  - `POST /api/auth/login`
  - `POST /api/auth/reset-password`
- Redefinicao valida obrigatoriamente o e-mail informado com o e-mail cadastrado do usuario (Master/Gerente/Atendente), com fallback legado para e-mail do tenant quando necessario.
- Modelo de atendente passou a armazenar `email`; cadastro de atendente no admin agora exige e-mail.
- Sessao no frontend persistida em `localStorage` e logout ajustado para encerrar sessao sem limpar toda configuracao local.

### Palavras-chave para pesquisa futura

- `login-admin`
- `reset-senha-email-cadastrado`
- `auth-login-reset-password`
- `attendant-email`

## 2026-04-22 - Base de privilegios: assinante Master + walkup provisionado

- Iniciada a base de privilegios no tenant:
  - novo assinante passa a ter papel base `master` (`accessRole`).
  - listagem aplica fallback para `master` quando campo nao existir.
- Tenant `walkup@walkuptec.com.br` passou a ser tratado como ambiente Typebot ja iniciado/provisionado:
  - create/list/provision retornam `typebotProvisionStatus: "provisioned"` para esse e-mail.
  - erro de provisionamento e limpo para esse caso.
- Build da API validado apos os ajustes.

### Palavras-chave para pesquisa futura

- `accessRole-master-tenant`
- `walkup-typebot-provisioned`
- `tenant-privilegios-base`
- `system-master-owner-email`

## 2026-04-22 - Remocao da distincao de planos

- Removida a distincao de planos no sistema (`Starter`, `Pro`, `Business`) no frontend e backend.
- Tela de assinantes sem filtro de plano e sem coluna `Plano`.
- Modal de criar/editar assinante sem campo de plano.
- API de tenants (`create`/`update`) nao exige mais `plan` nos schemas e no service/repository.
- Build validado em `api` e `admin`.

### Palavras-chave para pesquisa futura

- `remocao-planos-saas`
- `tenant-sem-plan`
- `admin-sem-filtro-de-plano`
- `tenant-schema-sem-plan`

## 2026-04-22 - Biblioteca Master com fluxos padrão do sistema

- Adicionada tela lateral `Biblioteca Master` no admin (visível para perfil master do sistema) para listar fluxos da conta origem `walkup@walkuptec.com.br`.
- Backend ganhou endpoints para promover/remover fluxos como `Padrão Sistema` e persistência em `data/system-master-library.json`.
- A biblioteca dos assinantes (`/api/master/flow-library`) agora inclui itens publicados pela Biblioteca Master, permitindo ativar da biblioteca no workspace do assinante.
- Fluxo de ativação mantém criação do fluxo no tenant assinante dentro do SaaS; cópia física no ambiente Typebot do assinante depende de integração API específica do Typebot.

### Palavras-chave para pesquisa futura

- `biblioteca-master`
- `system-master-library-json`
- `padrao-sistema-fluxos`
- `walkup-owneremail-source`
- `flow-library-merge-system-items`

## 2026-04-22 - Base de provisionamento Typebot por e-mail do assinante

- Tenant passou a armazenar metadados de ambiente Typebot (`typebotOwnerEmail`, status, workspace e sync).
- Novo endpoint `POST /api/master/tenants/:id/typebot/provision` para iniciar provisionamento por assinante.
- Tela `Assinantes` mostra status de provisionamento Typebot e ação `Provisionar Typebot`.
- Fluxo atual usa estratégia `pending_manual` com link de signup por e-mail; integração admin API do Typebot pode ser acoplada na sequência.

### Palavras-chave para pesquisa futura

- `tenant-typebot-provisioning`
- `typebotOwnerEmail`
- `typebotProvisionStatus`
- `pending_manual`

## 2026-04-22 - Fix de Biblioteca Master vazia

- Corrigido endpoint `source-flows` para usar fallback também quando tenant origem existe, porém sem fluxos associados.
- Repositórios de dados do API passaram a resolver arquivos por caminho fixo em `apps/api/data` (independente de `process.cwd()`).
- Resultado: Biblioteca Master voltou a listar fluxos salvos no ambiente.

### Palavras-chave para pesquisa futura

- `biblioteca-master-vazia`
- `source-flows-fallback`
- `data-path-process-cwd`

## 2026-04-22 - Biblioteca Master filtra somente fluxos ativos

- Endpoint `source-flows` agora valida URL de cada fluxo e retorna apenas ativos (`HTTP 2xx`).
- Implementado helper com timeout para evitar bloqueio da listagem.

### Palavras-chave para pesquisa futura

- `source-flows-active-filter`
- `biblioteca-master-ativos`
- `isFlowUrlActive-timeout`

# Memória consolidada

## 2026-04-20 - Base SaaS local Typebot

- Projeto inicializado em `D:/typebot-Saas` com remoto GitHub `walkup-tec/typeBot`.
- Infra local preparada com `Postgres + Redis + MinIO`.
- API inicial criada com padrão `controller/service/repository`.
- Módulos iniciais:
  - gestão master de tenants (criar, listar, bloquear/desbloquear);
  - fila de atendimento por tenant com atribuição de atendente (`in_service`).
- `README.md` documentado com setup local e roadmap.

### Palavras-chave para pesquisa futura

- `typebot-saas`
- `master-tenants`
- `tenant-status`
- `queue-assign-agent`
- `local-docker-minio-redis-postgres`

## 2026-04-20 - Template visual admin e widget

- Criados `apps/admin` e `apps/widget` com layout dark no estilo Typebot.
- Painel admin já integrado para:
  - criar assinante;
  - listar assinantes;
  - bloquear/desbloquear;
  - listar fila por tenant e assumir atendimento.
- Widget criado com chat base e botão de handoff para fila.
- Scripts da raiz ampliados para build/execução dos 3 apps (`api`, `admin`, `widget`).
- Build completo validado.

### Palavras-chave para pesquisa futura

- `admin-master-console`
- `subscriber-workspace-ui`
- `widget-live-agent-handoff`
- `vite-react-template-typebot`

## 2026-04-20 - Integração widget com Typebot real

- Widget local (`apps/widget`) integrado ao Typebot real via `iframe` configurável.
- Novas variáveis Vite adicionadas para URL pública do bot e parâmetros de integração local.
- Fluxo de atendimento humano mantido, enviando para a fila SaaS.
- `README` atualizado com setup da integração.

### Palavras-chave para pesquisa futura

- `vite_typebot_public_url`
- `widget-iframe-viewer`
- `live-handoff-queue`

## 2026-04-20 - Handoff Typebot para fila ao vivo

- Implementado endpoint de handoff para acionamento direto do Typebot (`/api/typebot/handoff`).
- Fila agora registra origem do fluxo (`sourceFlowLabel`) e origem da interação (`typebot`/`widget`).
- Implementada sessão de mensagens para atendimento manual:
  - leitura e envio de mensagens por sessão.
- Admin atualizado para abrir atendimento no widget em modo agente.
- Widget atualizado com modo agente para continuidade manual do atendimento.

### Palavras-chave para pesquisa futura

- `api-typebot-handoff`
- `admin-assign-open-agent-mode`
- `chat-session-messages`

## 2026-04-20 - Sinaleira de status dos fluxos

- Implementada checagem de status de fluxos salvos via endpoint backend dedicado.
- Listagem de fluxos no `Master Console` agora mostra:
  - Data
  - Apelido
  - URL
  - Status com sinaleira (`Ativo` verde / `Inativo` vermelho / `Verificando` amarelo).
- Mantido padrão mobile-first na tabela e na visualização do status.

### Palavras-chave para pesquisa futura

- `flow-status-api`
- `active-inactive-indicator`
- `typebot-url-health`

## 2026-04-20 - Correção redirect handoff + atualização da fila

- Corrigido redirecionamento do handoff para não depender mais do `loca.lt` da porta `5174`.
- API agora devolve `handoffUrl` público no mesmo domínio do endpoint de handoff (`ngrok`), usando a rota `GET /handoff-view`.
- Implementada tela pública mínima de chat visitante em `handoff-view`, ligada à sessão existente de mensagens.
- Painel admin atualizado com polling de fila a cada 3 segundos na tela `Fila ao Vivo`.
- Adicionado log de erro no middleware global da API para diagnóstico rápido.

### Palavras-chave para pesquisa futura

- `handoff-view`
- `ngrok-handoff-public-url`
- `live-queue-polling-3s`
- `loca-lt-400-fallback`

## 2026-04-20 - Persistencia real de assinantes e fluxos

- Assinantes (`tenants`) migrados de memória para persistência em `data/tenants.json`.
- Fluxos salvos por assinante adicionados no backend com persistência em `data/saved-flows.json`.
- Admin deixou de usar `localStorage` como fonte principal dos fluxos; agora consulta/salva pela API.
- Migração automática de fluxos antigos do `localStorage` para backend adicionada no carregamento.

### Palavras-chave para pesquisa futura

- `tenants-json-persistencia`
- `saved-flows-json-persistencia`
- `flows-api-por-tenant`
- `migracao-automatica-localstorage`

## 2026-04-20 - Typebot redirect: campos flat no handoff

- Ajustado `POST /api/typebot/handoff` para incluir `urlFlat`, `redirectUrlFlat` e `handoffUrlFlat` no nível raiz do JSON.
- Objetivo: reduzir ambiguidade de `data.url` vs `data.data.url` no mapeamento de variáveis do Typebot.

### Palavras-chave para pesquisa futura

- `typebot-redirect-urlflat`
- `handoff-json-flat-fields`

## 2026-04-20 - Admin: ignorar loca.lt morto no widget URL

- `apps/admin` passou a ignorar `VITE_WIDGET_BASE_URL` quando contém `loca.lt` (túnel instável) e usar fallback `http://localhost:5174`.
- `apps/admin/.env.local` deixou de fixar `loca.lt` e virou template comentado para `ngrok`.

### Palavras-chave para pesquisa futura

- `loca-lt-503`
- `admin-widget-baseurl-fallback`

## 2026-04-20 - Verificação local (API/Admin/Widget)

- Confirmado healthcheck local da API e HTTP `200` no Admin (`5173`) e Widget (`5174`) no momento da checagem.

### Palavras-chave para pesquisa futura

- `healthcheck-local-5173-5174`

## 2026-04-20 - Handoff com iframe do Typebot + chat

- `handoff-view` agora suporta layout com viewer do Typebot em `iframe` + painel de chat ao vivo.
- `POST /api/typebot/handoff` aceita `typebotViewerUrl` opcional e propaga para `handoffUrl` via query `typebotUrl`.

### Palavras-chave para pesquisa futura

- `typebotViewerUrl`
- `handoff-view-typebot-iframe`

## 2026-04-21 - Handoff refinado (chat Typebot-like + contexto do lead)

- `handoff-view` passou para layout focado em chat (continuidade visual do Typebot) com bolhas e shell único.
- `POST /api/typebot/handoff` agora aceita `leadContext` opcional para exibir no topo os dados já informados pelo lead.
- `leadContext` é serializado no `handoffUrl` e renderizado como chips de contexto no chat.

### Palavras-chave para pesquisa futura

- `leadContext-chat`
- `handoff-typebot-like`
- `continuidade-do-fluxo`

## 2026-04-21 - Tenant dinâmico no handoff (SaaS)

- `tenantId` no `POST /api/typebot/handoff` passou a ser opcional.
- API resolve automaticamente o tenant via `sourceFlowLabel` a partir dos fluxos salvos por assinante.
- Critérios: `nickname` igual ao label ou URL contendo o slug do label.

### Palavras-chave para pesquisa futura

- `tenantid-opcional-handoff`
- `sourceflowlabel-tenant-auto`
- `saas-dinamico-sem-codigo`

## 2026-04-21 - Layout redirect lead igual Typebot + captura visual

- `handoff-view` no modo lead foi simplificado para uma única tela de conversa (sem composição iframe+chat).
- `POST /api/typebot/handoff` passou a capturar visual do viewer (cores e imagem) para aplicar no redirect.
- Parâmetros de tema/avatar são enviados na URL de handoff e usados para renderização do frontend do lead.

### Palavras-chave para pesquisa futura

- `redirect-lead-typebot-like`
- `viewer-theme-capture`
- `profile-image-capture`

## 2026-04-21 - Ajuste fino: remover sensação de layout duplo no redirect

- Modo `visitor` consolidado em layout único de chat para parecer continuidade do Typebot.
- Avatares e cores aplicados no frontend do lead a partir de configuração capturada no handoff.
- Modo `agent` preservado para operação interna sem impacto no redirect do lead.

### Palavras-chave para pesquisa futura

- `redirect-single-chat-typebot`
- `no-nested-layout`

## 2026-04-21 - Captura automática de cachê + tema salvo por fluxo

- Handoff passou a capturar automaticamente variáveis extras do body como contexto do lead quando `leadContext` explícito não for enviado.
- Fluxos agora suportam `redirectTheme` persistido.
- Novo endpoint `PATCH /api/master/flows/:flowId/theme` para atualizar tema do redirect por fluxo.
- No handoff, tema do fluxo salvo tem prioridade sobre detecção automática do viewer.

### Palavras-chave para pesquisa futura

- `leadcontext-auto-passthrough`
- `flow-redirect-theme`
- `handoff-theme-priority`

## 2026-04-21 - Handoff tolerante a leadContext vazio

- Corrigida validação do `POST /api/typebot/handoff` para aceitar `leadContext` como string vazia (`""`) quando o Typebot não renderiza `{{variables}}`.
- Mantido fallback dinâmico: sem `leadContext` válido, backend usa auto-captura dos demais campos do body.
- Build completo validado após alteração.

### Palavras-chave para pesquisa futura

- `leadcontext-empty`
- `typebot-variables-empty-string`
- `handoff-400-leadcontext`

## 2026-04-21 - Redirect com fallback de cache local do lead

- `handoff-view` atualizado para exibir painel de contexto do lead também via fallback de `localStorage` quando `leadContext` vier vazio no handoff.
- Contexto agora é persistido no navegador por tenant+flow+nome para manter continuidade visual em retomadas no mesmo dispositivo.
- Objetivo: reduzir sensação de reinício da conversa quando Typebot não entrega variáveis no payload.

### Palavras-chave para pesquisa futura

- `lead-cache-localstorage`
- `handoff-view-context-fallback`
- `continuity-chat-redirect`

## 2026-04-21 - Handoff com fallback para `variables` do Typebot

- `POST /api/typebot/handoff` passou a suportar extração automática de contexto quando o payload contém `variables` no formato array (`name`/`value`).
- Nova prioridade de contexto: `leadContext` válido > `variables` do payload > campos extras primitivos.
- Objetivo: reduzir dependência de scripts/expressões no editor do Typebot para envio dinâmico de variáveis.

### Palavras-chave para pesquisa futura

- `variables-name-value-fallback`
- `leadcontext-priority`
- `typebot-webhook-compat`

## 2026-04-21 - Redirect simplificado com fila + WhatsApp

- Redesenhado o `handoff-view` para o lead em modo simples, sem iframe/view do Typebot.
- Nova tela foca em experiência de espera: status de fila, aviso para não fechar a página e chamada clara de atendimento.
- Adicionado botão de WhatsApp para `+55 51 99746-2102` com mensagem pré-preenchida usando fluxo, nome e variáveis capturadas do lead.

### Palavras-chave para pesquisa futura

- `redirect-espera-fila`
- `whatsapp-preenchido-com-variaveis`
- `remover-view-typebot-redirect`

## 2026-04-21 - Mensagem WhatsApp só com variáveis do lead

- Ajustada mensagem do botão WhatsApp no redirect para remover metadados de fluxo e nome.
- Texto agora inclui somente os dados informados pelo lead (`Dados informados` + lista de variáveis).

### Palavras-chave para pesquisa futura

- `whatsapp-sem-fluxo`
- `whatsapp-sem-nome-lead`
- `mensagem-so-variaveis`

## 2026-04-21 - Mensagem WhatsApp com alias do fluxo

- Ajustado texto inicial do WhatsApp para usar alias do fluxo (`sourceFlowLabel`) no formato: `Olá, tenho interesse no <alias>.`
- Mantido bloco `Dados informados` com variáveis capturadas do lead.

### Palavras-chave para pesquisa futura

- `flow-alias-whatsapp`
- `sourceflowlabel-mensagem`
- `mensagem-interesse-no-fluxo`

## 2026-04-21 - Separação entre label técnico e alias exibido

- Adicionado `flowAlias` opcional no handoff para uso visual (redirect/WhatsApp).
- `sourceFlowLabel` permanece técnico para resolver tenant/fluxo com estabilidade.
- URL do redirect agora usa `flowAlias` quando enviado, sem impactar roteamento.

### Palavras-chave para pesquisa futura

- `flowalias-display`
- `sourceflowlabel-tecnico`
- `redirect-whatsapp-alias`

## 2026-04-21 - Remover flowAlias de dados do lead no WhatsApp

- `flowAlias` passou a ser tratado como chave reservada no handoff.
- Com isso, aparece apenas na frase inicial da mensagem e não na lista de `Dados informados`.

### Palavras-chave para pesquisa futura

- `flowalias-reserved-key`
- `lead-summary-without-flowalias`

## 2026-04-21 - Tela do lead troca automático para chat após assumir

- Implementado endpoint de status por contato (`GET /api/chat/queue/:contactId`) com isolamento por tenant.
- `handoff-view` do lead passa a alternar em tempo real:
  - espera/fila (`waiting`);
  - chat ao vivo (`in_service`).
- Polling de status e mensagens a cada 2.5s, sem recarregar página.

### Palavras-chave para pesquisa futura

- `lead-auto-chat-switch`
- `in_service-transition`
- `queue-contact-status-api`

## 2026-04-21 - Chat do lead estilo WhatsApp + avatar por assinante

- Adicionado suporte a `profileImageUrl` no tenant com endpoint para atualização.
- Admin recebeu configuração de imagem de perfil do assinante com preview.
- `handoff-view` do lead foi redesenhado:
  - mobile full-screen;
  - desktop em modal;
  - visual de chat aproximado ao WhatsApp.
- Avatar configurado do assinante passa a ser usado no chat no lugar do ícone BOT.

### Palavras-chave para pesquisa futura

- `tenant-avatar-config`
- `lead-chat-mobile-fullscreen`
- `desktop-modal-handoff`
- `replace-bot-icon-with-tenant-avatar`

## 2026-04-21 - Refino visual com glassmorphism no estado de espera

- Overlay de espera atualizado com blur de fundo, gradientes e saturação para efeito frosted glass.
- Card de espera recebeu fundo translúcido, borda suave, brilho interno e elementos decorativos.
- Mantida a lógica de liberar chat ao assumir atendimento.

### Palavras-chave para pesquisa futura

- `glass-overlay-waiting`
- `frosted-card-ui`
- `modern-redirect-look`

## 2026-04-21 - Nova tela de assinantes com modal e ações

- Tela `Assinantes` refeita com botão destacado de novo assinante.
- Listagem agora inclui avatar, nome, plano, status e ações (`Bloquear/Reativar`, `Editar`).
- Modal de criar/editar com upload de imagem, nome, e-mail, WhatsApp e plano.
- Backend de tenants ampliado com campo `whatsapp` e endpoint de edição completa (`PATCH /api/master/tenants/:id`).

### Palavras-chave para pesquisa futura

- `subscribers-ui-rework`
- `tenant-edit-endpoint`
- `tenant-modal-upload-image`

## 2026-04-21 - Branding do admin com logo DRAX

- Aplicada logo DRAX no topo da sidebar do admin a partir do asset do projeto WABA.
- Texto institucional atualizado para `Type Bot e Chat de atendimento`.
- Ajustado tamanho da logo para boa leitura em mobile e desktop.

### Palavras-chave para pesquisa futura

- `drax-brand-admin`
- `sidebar-logo-update`
- `typebot-chat-branding`

## 2026-04-21 - Correção de 500 ao salvar assinante com imagem

- API ajustada para aceitar payload JSON maior (`express.json({ limit: "8mb" })`).
- Tratamento explícito para `entity.too.large` retornando `413` com mensagem amigável.
- Objetivo: permitir salvar edição de assinante com imagem base64 sem erro interno.

### Palavras-chave para pesquisa futura

- `tenant-edit-500`
- `base64-image-payload`
- `express-body-limit`

## 2026-04-21 - Persistência da fila para evitar chat órfão no lead

- Fila e mensagens do atendimento passaram a persistir em `data/queue-state.json`.
- `QueueRepository` agora carrega estado no startup e salva após enqueue/assign/message.
- Objetivo: evitar `Contact not found for tenant` no redirect do lead após reinicialização da API.

### Palavras-chave para pesquisa futura

- `queue-state-json`
- `lead-contactid-persistencia`
- `chat-not-opening-after-assign`

## 2026-04-21 - Imagem única: Master Console = imagem do assinante

- `profileImageUrl` é única; o modal de assinantes não altera mais a imagem (só o Master Console → Perfil de atendimento).
- `PATCH /api/master/tenants/:id` sem `profileImageUrl` preserva a imagem já salva (evita apagar ao editar dados cadastrais).

### Palavras-chave para pesquisa futura

- `profile-image-single-source`
- `tenant-patch-preserve-profileimage`

## 2026-04-21 - Master Console: atendentes, biblioteca, tema da logo, link curto

- Cadastro de atendentes por tenant (Master / Gerente / Atendente) com senha hasheada (`scrypt`), persistência em `data/attendants.json`.
- Fluxos: `displayLabel` editável no painel (apelido Typebot `nickname` intacto); `POST .../share-code` + redirect `GET /r/:code`; biblioteca em `data/flow-library.json` + ativação `from-library`.
- Tema por tenant `defaultChatTheme` (“Padrão Sistema”), cor predominante extraída no admin ao salvar logo; handoff mescla tema do tenant com tema do fluxo/viewer.
- Repositórios `FlowRepository` e `TenantRepository` unificados em `src/lib/repositories.ts` para evitar dessincronia entre rotas.

### Palavras-chave para pesquisa futura

- `master-attendants-scrypt`
- `flow-display-label-shortsharecode`
- `flow-library-json`
- `tenant-default-chat-theme`
- `redirect-r-shortlink`
- `singleton-flow-tenant-repository`

## 2026-04-24 - Correção de corrupção visual por metadados de ícone/imagem no Typebot

- Problema: `icon` estava sendo enviado como `data:image/base64` para a API Builder, gerando comportamento visual incorreto no topo do Typebot.
- Correção: sanitização em `typebot-builder.service.ts` para aceitar `icon/image` somente como URL pública (`http/https`), enviando `null` quando inválido.
- Ação operacional: limpeza dos typebots existentes da Ideal Cred para remover `icon/image` inválidos e normalizar metadados.

### Palavras-chave para pesquisa futura

- `typebot-icon-data-url`
- `metadata-corruption-header`
- `sanitize-metadata-http-url`

## 2026-04-24 - Correção do mapeamento de metadata (favIconUrl/imageUrl)

- Diagnóstico: API do Typebot não persistia `metadata.icon`/`metadata.image`; os campos válidos são `settings.metadata.favIconUrl` e `settings.metadata.imageUrl`.
- Ajuste em `typebot-builder.service.ts` para aplicar metadados nos campos corretos durante importação e resync.
- Reaplicação imediata dos metadados em todos os fluxos da Ideal Cred.

### Palavras-chave para pesquisa futura

- `typebot-metadata-faviconurl`
- `typebot-metadata-imageurl`
- `ideal-cred-metadata-reapply`

## 2026-04-24 - Regra operacional: após alterar fluxo, publicar

- Rotina ajustada para publicar automaticamente o typebot após alteração em fluxo existente durante sync (inclusive metadados).
- Implementado em `updateTypebotMetadataOnTarget` com publish após `PATCH` bem-sucedido (fluxo principal e fallback).

### Palavras-chave para pesquisa futura

- `auto-publish-after-flow-change`
- `publish-after-metadata-update`

## 2026-04-24 - Propagação de alterações da Walkup para cópias dos assinantes

- Nova rotina de sync para fluxos existentes no destino: quando o fluxo já existe no workspace do assinante, o sistema atualiza o schema completo a partir da matriz (Walkup) e publica em seguida.
- Implementado fallback para atualização de metadados caso o patch completo não seja aceito, sem quebrar o ciclo.
- Coberto tanto para biblioteca padrão quanto para import em massa da matriz.

### Palavras-chave para pesquisa futura

- `sync-copia-fluxo-walkup`
- `replicar-alteracoes-matriz-para-assinantes`
- `typebot-existing-copy-refresh`

## 2026-04-24 - Avatar do bot no tema fixado com logo do assinante

- Ajuste de backend para forçar `redirectTheme.profileImageUrl` usando `tenant.profileImageUrl` (logo do assinante).
- Coberto em listagem, criação e atualização de tema de fluxo.
- Resultado: o avatar do bot no tema não depende mais de valor externo divergente do tenant.

### Palavras-chave para pesquisa futura

- `tenant-logo-bot-avatar`
- `flow-theme-avatar-enforced`

## 2026-04-24 - Correção de layout estourando no Theme (Avatar do bot)

- Problema: `hostAvatar.url` com `data:image;base64` muito longo aparecia no editor e estourava o layout visual.
- Ajuste: no Theme do Typebot, `hostAvatar.url` agora aceita apenas `http(s)`; sem URL pública, grava `isEnabled=false` e `url=""`.
- Sync reaplicado na Ideal Cred para limpar o estado já persistido.

### Palavras-chave para pesquisa futura

- `typebot-hostavatar-overflow`
- `theme-chat-hostavatar-url`

## 2026-04-24 - Avatar ativo com logo + otimização de upload

- Reversão da regra que desativava avatar quando a logo não era `http(s)`: avatar do bot voltou a aceitar `data:image` e ficar ativo.
- Melhoria de frontend: upload de `Logo da marca` agora otimiza para 96x96 PNG antes de persistir (reduz payload e evita estouro visual).
- Necessário reenviar a logo para aplicar a versão otimizada nos fluxos já existentes.

### Palavras-chave para pesquisa futura

- `avatar-ativo-logo-assinante`
- `resize-logo-upload-96x96`

## 2026-04-24 - Avatar ativo com URL pública da logo (sem texto gigante)

- Ajuste definitivo para Theme do Typebot: `hostAvatar.url` não recebe mais `data:image` direto.
- Nova estratégia: avatar ativo apontando para endpoint público da API (`/api/public/tenants/:id/logo`), que serve a logo do assinante.
- Resultado: avatar permanece ativo e o layout do editor não estoura com string base64.

### Palavras-chave para pesquisa futura

- `avatar-bot-url-publica`
- `public-tenant-logo-endpoint`

## 2026-04-24 - Correção de avatar corrompido (remoção de localhost)

- Ajuste com URL `localhost` no `hostAvatar.url` causou ícone quebrado no Typebot remoto.
- Fluxo revertido para `data:image/http(s)` direto no avatar do Theme.
- Logo da Ideal Cred foi otimizada (64x64 PNG) para reduzir payload do `data:image` e diminuir risco de estouro visual.

### Palavras-chave para pesquisa futura

- `avatar-corrompido-localhost`
- `hostavatar-dataimage-otimizado`

## 2026-04-24 - Avatar sem estouro usando URL pública real

- `hostAvatar.url` em `data:image` causava texto gigante no editor; `localhost` causava imagem quebrada no remoto.
- Solução operacional aplicada: logo do tenant em URL pública real e sync reaplicado.
- Resultado: avatar ativo com imagem válida e sem texto estourando o layout.

### Palavras-chave para pesquisa futura

- `avatar-hostavatar-url-publica`
- `remove-dataurl-avatar-theme`

## 2026-05-11 - Menu Lista de Clientes no admin

- Nova tela `clientList` no admin para assinantes e atendentes: tabela dinâmica com contatos da fila do tenant, colunas fixas (Nome, WhatsApp, CPF, Fluxo/Produto, Atendente, Atualizado em) e colunas extras só para chaves não vazias do `leadContext`.
- Busca por CPF, nome ou WhatsApp; filtros Fluxo/Produto e com/sem WhatsApp; ação Ver detalhes reutiliza `LeadDetailModal`.
- Dados vêm de `GET /api/chat/queue` já carregado no painel (sem endpoint novo).

### Palavras-chave para pesquisa futura

- `lista-de-clientes`
- `client-directory-admin`

## 2026-05-12 - CPF mascarado no card de detalhes do lead

- CPF resolvido do `leadContext` e exibido logo abaixo do WhatsApp no topo do card (admin `LeadDetailModal` e widget `LeadDrawerPanel`), com máscara `000.000.000-00`.
- Chaves de CPF removidas da listagem de variáveis do Typebot para evitar duplicidade; lista de clientes reutiliza a mesma formatação.

### Palavras-chave para pesquisa futura

- `cpf-mascarado-lead-detail`
- `resolve-lead-cpf`

## 2026-05-12 - Nome do contato com fallback para nome_completo

- Regra central: priorizar `Nome_Contato` no contexto do lead; se vazio, usar `nome_completo` (também `nome_competo` e `nome completo`).
- Handoff, normalização da fila na API, admin e widget passam a aplicar a mesma resolução de nome.

### Palavras-chave para pesquisa futura

- `resolve-lead-contact-name`
- `nome-contato-nome-completo-fallback`

## 2026-05-12 - Diagnóstico login painel (ligação à API)

- Sintoma em `painel.chattypebot.com`: toast **Sem ligação à API** ao enviar login; rodapé já mostrava `https://soma-api-typebot-crm.achpyp.easypanel.host` (URL correta no bundle).
- Testes externos (PowerShell/Node): `GET /health` **200**; CORS com `Origin: https://painel.chattypebot.com` OK; `POST /api/auth/login` responde (401 com senha errada para `draxsistemas@gmail.com`).
- Conclusão: falha no `catch` do `fetch` (rede/TLS/browser), não credencial nem `VITE_API_BASE_URL` ausente no build.
- Admin: sonda `/health` na tela de login, estado visual no rodapé da API e mensagem de erro com detalhe do `Error.message`.

### Palavras-chave para pesquisa futura

- `login-sem-ligacao-api`
- `auth-api-endpoint-hint-health-probe`

## 2026-05-12 - Coluna Ações centralizada (lista de clientes)

- Cabeçalho **Ações** e ícones da última coluna da tabela de clientes alinhados ao centro da célula (`clients-table-row > span:last-child`).
- Fila de atendimento: mesma centralização na coluna de ações (`queue-table-row`).

### Palavras-chave para pesquisa futura

- `clients-table-actions-center`
- `queue-actions-center`

## 2026-05-12 - Reforço centralização coluna Ações

- Coluna **Ações** com largura fixa (76px) e classe `clients-table-col-actions` no cabeçalho e nas células da lista de clientes.
- Fila: classe `queue-table-col-actions` e última coluna fixa (76px) no breakpoint largo.

### Palavras-chave para pesquisa futura

- `clients-table-col-actions`
- `queue-table-col-actions`

## 2026-05-12 - Centralização do ícone na coluna Ações (grelha)

- Template de colunas da lista de clientes via `--clients-table-cols` no contentor da tabela.
- Botão de detalhe como filho direto da grelha com `justify-self: center` na coluna de ações.

### Palavras-chave para pesquisa futura

- `clients-table-cols-css-var`
- `clients-table-action-grid-item`

## 2026-05-12 - Lista de clientes em tabela HTML (Ações centralizada)

- Lista de clientes deixou de usar grelha CSS em `div`; passou a `<table>` com coluna **Ações** fixa (76px) e `text-align: center`.
- Produção em `painel.chattypebot.com` ainda servia bundle antigo (`index-CdLZziWW.css`) sem os ajustes recentes — redeploy do painel necessário.

### Palavras-chave para pesquisa futura

- `clients-table-html-actions-center`
- `painel-bundle-antigo-actions-column`

## 2026-05-12 - Exportar lista de clientes para Excel

- Botão **Exportar Excel** na Lista de Clientes; exporta `filteredRows` (filtros ativos) ou lista completa.
- Arquivo `.xlsx` com colunas da tabela (sem Ações); nome `clientes-AAAA-MM-DD.xlsx` ou `-filtrado` com filtros.
- Dependência `xlsx` no admin; import dinâmico no clique.

### Palavras-chave para pesquisa futura

- `export-client-directory-excel`
- `clients-list-export-btn`

## 2026-05-12 - Nome único no export Excel da lista de clientes

- Cada download usa UUID no nome: `clientes-AAAA-MM-DD-{id}.xlsx` (ou `-filtrado`).

### Palavras-chave para pesquisa futura

- `clientes-export-uuid-filename`

## 2026-05-12 - Diagnóstico painel sem exportar Excel nem centralizar Ações

- `painel.chattypebot.com` servia `index-CdLZziWW.css` / `index-BuzWbGuk.js` (commit `140f34a`); sem `Exportar Excel`, `clients-table-col-actions` nem chunk `xlsx`.
- Causa: alterações do admin só no working tree; Easypanel rebuilda a partir do Git.
- Correção: commit/push `0aad114` (tabela HTML, coluna Ações 76px, export Excel).
- Próximo passo: redeploy **painel-typebot-crm** (não só API); validar novo hash de assets no HTML.

### Palavras-chave para pesquisa futura

- `painel-bundle-desatualizado`
- `deploy-painel-typebot-crm-admin`

## 2026-05-12 - Login/reset walkup 401/404 em produção

- API com Postgres: `walkup@walkuptec.com.br` não cadastrado → login 401 e reset 404.
- Recuperação: `API_ENSURE_SYSTEM_MASTER` no arranque; `API_ALLOW_SYSTEM_MASTER_RESET_PROVISION` no reset (documentado em `doc/EASYPANEL-AMBIENTE.env.example`).

### Palavras-chave para pesquisa futura

- `ensure-system-master-auth`
- `walkup-master-postgres-404`

## 2026-05-12 - Nome exibido do usuário Drax (Drax Sistemas)

- Sintoma: `draxsistemas@gmail.com` aparecia como `draxsistemas` / `darsistemas` quando `displayName` vinha vazio ou só o prefixo do e-mail.
- Correção: mapa canônico `draxsistemas@gmail.com` / `draxsistemas` / `darsistemas` → **Drax Sistemas** em `resolveAttendantDisplayName` (API, painel, widget) e no script inline do handoff.
- Reforço fila: `GET /api/chat/queue` e detalhe do contato normalizam `assignedAgentName`; atribuição grava nome canônico; coluna Atendente no painel resolve na renderização.
- Telas: login/boas-vindas, menu do usuário, fila, lista de clientes, modal do lead, atendentes, widget e resposta de login da API.

### Palavras-chave para pesquisa futura

- `known-attendant-display-name`
- `drax-sistemas-display-name`
- `resolve-queue-contact-assigned-agent-name`

## 2026-05-12 - Lista global de clientes para Master do Sistema

- Master do Sistema passa a ver **Lista de Clientes** no menu, agregando leads de todos os assinantes/atendentes.
- API: `GET /api/master/queue/contacts` retorna contatos da fila com `tenantName` e `assignedAgentName` normalizado.
- Painel: coluna **Assinante**, busca/export incluem assinante e atendente; modal do lead usa `tenantId` do contato.

### Palavras-chave para pesquisa futura

- `master-queue-contacts`
- `lista-clientes-system-master`

## 2026-05-12 - Commit e push deploy (caf5618)

- Commit `caf5618`: lista global de clientes no master, nome Drax Sistemas e endpoint `GET /api/master/queue/contacts`.
- Push em `origin/master` apos deploy da API apenas com `21e9687` (docs walkup), sem codigo do painel.
- Proximo passo: redeploy **api-typebot-crm** e **painel-typebot-crm**; hard refresh no painel.

### Palavras-chave para pesquisa futura

- `commit-caf5618-deploy`
- `redeploy-painel-api-pos-push`

## 2026-05-12 - Página de vendas e checkout Asaas (base)

- Novo app `apps/sales` (Vite) com planos, checkout e acompanhamento do pedido.
- API: `GET /api/public/sales/plans`, `POST /api/public/sales/checkout`, `GET /api/public/sales/orders/:id`, `POST /api/webhooks/asaas`.
- Pós-pagamento: provisiona assinante, fluxos padrão e e-mail de boas-vindas; pedidos em `billing-orders.json`.
- Env: `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_ACCESS_TOKEN`, `SALES_PLAN_*`; build vendas com `VITE_API_BASE_URL` e `VITE_PAINEL_URL`.

### Palavras-chave para pesquisa futura

- `sales-checkout-asaas`
- `billing-orders-json`

## 2026-05-12 - PV chattypebot.com (TanStack Start)

- `apps/sales` passou a usar o PV `walkup-tec/PV-typebot-chat` (TanStack Start); checkout via `POST /api/public/sales/subscriptions` e **Entrar** com `VITE_PAINEL_URL`.
- Build de produção: `apps/sales/.env.production` (`api.chattypebot.com`, `painel.chattypebot.com`); arranque `node scripts/serve-production.mjs` (SSR Node, porta `PORT`).
- Monorepo: `apps/sales` fora do workspace npm da raiz; scripts raiz usam `npm --prefix apps/sales`.
- Deploy: `doc/DEPLOY-VPS-chattypebot-com.md` — `chattypebot.com` = vendas; painel em subdomínio.
- Pendência: serviço Easypanel dedicado + `npm ci` limpo em `apps/sales` no servidor (node_modules local no Windows instável).

### Palavras-chave para pesquisa futura

- `pv-chattypebot-com-tanstack-start`
- `serve-production-sales-ssr`

## 2026-05-12 - Env Asaas na API local

- `apps/api/.env`: `ASAAS_API_BASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_ACCESS_TOKEN`, `SALES_PLAN_*` (mensal R$ 190, anual R$ 1188).
- Pendência: usuário preencher chaves e webhook no painel Asaas; replicar env no Easypanel da API.

### Palavras-chave para pesquisa futura

- `env-asaas-api-local`
- `webhook-asaas-access-token`

## 2026-05-13 - Retomada sessão (continuar projeto)

- Contexto recuperado: última entrega em 2026-05-12 foi **página de vendas** (`apps/sales`, TanStack Start) + **billing Asaas** na API (`/api/public/sales/*`, webhook `/api/webhooks/asaas`).
- Pendências operacionais (inalteradas): serviço Easypanel dedicado para `apps/sales` em `chattypebot.com` (build com `VITE_*`, start `node scripts/serve-production.mjs`); env `ASAAS_*` + webhook na API em produção; DNS/TLS `chattypebot.com` / `www`; opcional `npm ci` só em `apps/sales` no servidor se houver corrupção de `node_modules` no Windows.
- Validação local: `npm run build:sales` na raiz concluiu com sucesso (client + SSR, ~40s + ~1.4s).

### Palavras-chave para pesquisa futura

- `retomada-2026-05-13-typebot-saas`
- `build-sales-windows-ok`

## 2026-05-13 - PV-typebot-chat GitHub (Easypanel deploy)

- Repositório `walkup-tec/PV-typebot-chat`: commit `d2d49b8` em `main` — `package-lock.json` alinhado ao `package.json` (corrige `npm ci` no Nixpacks), `scripts/serve-production.mjs` versionado (SSR), `src/lib/salesApi.ts`, checkout no `index` via API pública, `vite.config` com `cloudflare: false` para build Node/Docker.
- Push feito a partir do clone local em `_pv-typebot-chat-temp` (Windows: `npm ci` local pode falhar com ENOTEMPTY; o CI Docker usa Linux).
- Nota: `.env.production` passou a ser versionado no commit seguinte (`04042bc`) — ver entrada abaixo.

### Palavras-chave para pesquisa futura

- `pv-typebot-chat-lockfile-ci`
- `easypanel-start-static-serve-production`

## 2026-05-13 - PV-typebot-chat `.env.production` (VITE URLs)

- Repositório `walkup-tec/PV-typebot-chat`: ficheiro **`.env.production`** versionado com `VITE_API_BASE_URL=https://api.chattypebot.com` e `VITE_PAINEL_URL=https://painel.chattypebot.com` para o `vite build` no Easypanel embutir URLs públicas; **`.env.example`** com defaults locais.
- Rebuild no Easypanel necessário para o novo bundle.

### Palavras-chave para pesquisa futura

- `vite-env-production-chattypebot`
- `pv-typebot-vite-api-painel-urls`

## 2026-05-13 - PV-typebot CSS 404 em `/assets/*`

- Causa: `curl -I https://chattypebot.com/assets/styles-*.css` → **404**; HTML SSR referenciava `/assets/...` mas o handler só delegava a `dist/server/server.js` sem servir ficheiros de `dist/client`.
- Correção: `scripts/serve-production.mjs` passa a servir **GET/HEAD** para `/assets/*` (e `favicon.ico` / `robots.txt`) a partir de `dist/client`, com MIME e cache; depois delega ao SSR.
- Commit `aaf74ab` em `walkup-tec/PV-typebot-chat`; mesmo padrão aplicado em `apps/sales/scripts/serve-production.mjs` no monorepo local.

### Palavras-chave para pesquisa futura

- `tanstack-ssr-assets-404`
- `serve-production-dist-client-assets`

## 2026-05-13 - Landing PV: logo igual ao painel admin

- Logo **DRAX** (`/drax-logo-footer.png`, ficheiro igual a `apps/admin/public/drax-logo-footer.png`) no **header** e **footer** da landing (`PV-typebot-chat`); removido ícone Lucide `Bot` + texto duplicado nesses blocos.
- `public/drax-logo-footer.png` no repo; `serve-production.mjs` passa a servir também `/drax-logo-footer.png` desde `dist/client`.
- Commit `12accb4` em `walkup-tec/PV-typebot-chat`; alinhado `apps/sales` (public + index + serve-production) no monorepo local.

### Palavras-chave para pesquisa futura

- `landing-drax-logo-admin-parity`
- `serve-production-public-png`
