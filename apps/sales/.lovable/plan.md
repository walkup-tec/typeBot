
# Drax — Landing Page de Conversão (One Page)

Site one-page de alta conversão para o SaaS Drax (Typebot + chat humano em tempo real, sem bloqueios), seguindo a identidade visual de draxsistemas.com.br.

## 🎨 Identidade Visual
- **Paleta**: fundo preto profundo (#0A0F14) + azul-escuro tech, **accent ciano/turquesa** (#2DE4D0 aprox.) como cor de ação, branco puro para textos, cinza-azulado para textos secundários.
- **Estilo**: dark-mode SaaS moderno, com elementos geométricos sutis (linhas, partículas, mesh azul ao fundo), glows ciano nos CTAs.
- **Tipografia**: sans moderna (Inter / Space Grotesk), títulos em peso 700–800 com display alto contraste, blocos coloridos destacando palavras-chave (estilo "SOB MEDIDA" do site original).
- **Microinterações**: hover glow ciano, fade-in on scroll, contadores animados, gradient borders nos cards.

## 📐 Estrutura (One Page com Scroll)

1. **Header sticky** — Logo Drax, navegação âncora (Sobre, Benefícios, Como Funciona, Planos, FAQ), botão "Entrar" + CTA primário "Assinar agora".
2. **Hero** — Headline forte ("Atendimento que vende. Sem bloqueios, sem limites."), subheadline, CTA "Começar agora" + secundário "Ver planos", mockup animado do chat (bot → humano).
3. **Sobre o Drax** — Bloco curto: evolução do Typebot + chat humano unificado.
4. **Benefícios** — Grid de 5 cards com ícones: Automação completa, Atendimento híbrido, Sem bloqueios, +Conversão, Escalabilidade.
5. **Como Funciona** — 4 passos visuais (Crie o fluxo → Publique → Bot atende → Humano assume).
6. **Funcionalidades** — Grid com screenshots/ilustrações: Builder de fluxos, Chat em tempo real, Gestão de leads, Atendimento simultâneo, Integrações.
7. **Comparação** — Tabela Drax vs WhatsApp vs Typebot (checks ciano vs X cinza).
8. **Pricing** — 3 planos (Starter / Pro destacado / Business), toggle mensal/anual, CTAs "Assinar" que disparam checkout via API Asaas.
9. **FAQ** — Accordion com objeções comuns.
10. **CTA Final** — Banner full-width com gradiente ciano e botão grande.
11. **Footer** — Links, contato, redes, termos, branding Drax.

## ⚙️ Funcionalidades Técnicas

- **Pagamento Asaas**: integração via server function (TanStack Start) que cria cobrança/assinatura na API Asaas e retorna link de checkout. Requer **API key do Asaas** como secret (solicitarei após aprovação).
- **Estrutura de login preparada**: rotas `/login` e `/dashboard` placeholder (UI pronta, sem auth funcional inicial — preparado para Lovable Cloud futuramente).
- **CTAs estratégicos**: header, hero, após benefícios, pricing, CTA final.
- **SEO**: meta tags otimizadas (title, description, OG), headings hierárquicos, palavras-chave (typebot, chatbot, automação de atendimento, chat online, atendimento sem bloqueios, geração de leads), conteúdo SSR via TanStack Start.
- **Performance**: imagens otimizadas, lazy-load, animações leves (CSS/Framer Motion mínimo).
- **Mobile-first**: layout 100% responsivo, menu hamburguer, CTA fixo no rodapé mobile.

## 📝 Conteúdo (PT-BR)
Copy persuasiva profissional gerada automaticamente: estrutura **dor → solução → prova → ação** em cada seção.

## 🔑 O que precisarei depois da aprovação
1. **API Key do Asaas** (sandbox e/ou produção) para ativar checkout real — posso entregar com botões mockados primeiro e plugar a key depois.
2. Confirmação de valores e nomes dos 3 planos (posso propor valores de mercado se preferir).
