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

## 2026-04-23 - Correcao de tenant no login do mozart.hotmart@gmail.com

- Validado que o login estava retornando indevidamente o tenant `Walkup`.
- Usuario `mozart.hotmart@gmail.com` foi movido para o tenant correto `Ideal Cred`.
- Registro antigo no tenant `Walkup` foi removido para eliminar colisao de contexto.
- Login revalidado com sucesso retornando `masterProfile = subscriber_master` no tenant correto.

### Palavras-chave para pesquisa futura

- `fix-tenant-login-mozart-hotmart`
- `tenant-incorreto-walkup`
- `realocar-usuario-ideal-cred`
- `auth-login-tenantid`

## 2026-04-23 - Diagnostico de boas-vindas para mozart.hotmart@gmail.com

- Backend de cadastro/SMTP revisado e teste real executado no endpoint de atendentes.
- Resultado validado: `emailDelivery.status = "sent"` para `mozart.hotmart@gmail.com`.
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
