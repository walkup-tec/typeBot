import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bot,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Zap,
  Users,
  Workflow,
  Check,
  X,
  Menu,
  ArrowRight,
  Sparkles,
  Headphones,
  LineChart,
} from "lucide-react";
import { WhatsAppBrandIcon } from "@/components/icons/WhatsAppBrandIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSalesSubscription, fetchSalesPlans, resolvePainelUrl } from "@/lib/salesApi";
import { digitsFromCpfCnpj, maskCpfCnpjInput } from "@/lib/maskCpfCnpj";
import { digitsFromPhone, isValidBrazilMobileDigits, maskBrazilMobileInput } from "@/lib/maskPhone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
});

const NAV = [
  { href: "#sobre", label: "Sobre" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all ${
        scrolled
          ? "border-b border-border/60 bg-background/80 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center">
          <img
            src="/drax-logo-footer.png"
            alt="Drax"
            className="h-8 w-auto max-w-[128px] object-contain sm:h-9"
          />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={resolvePainelUrl() || "#"}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Entrar
          </a>
          <a href="#planos">
            <Button className="bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90">
              Assinar agora
            </Button>
          </a>
        </div>

        <button
          aria-label="Abrir menu"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground"
              >
                {n.label}
              </a>
            ))}
            <a href="#planos" onClick={() => setOpen(false)}>
              <Button className="w-full bg-primary text-primary-foreground">Assinar agora</Button>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function ChatMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-3xl bg-primary/20 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[var(--surface)] shadow-[var(--shadow-elegant)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-xs font-medium">Drax • Online</span>
          </div>
          <Sparkles className="h-4 w-4 text-primary" />
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-end gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
              Olá! Sou o assistente Drax 👋 Como posso ajudar?
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
              Quero falar sobre os planos
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
              Vou te conectar com um humano em segundos…
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 py-1 text-[11px] uppercase tracking-wider text-primary">
            <div className="h-px w-8 bg-primary/40" />
            Atendente humano entrou
            <div className="h-px w-8 bg-primary/40" />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
              <Headphones className="h-4 w-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
              Oi! Aqui é a Marina 🙂 Vamos fechar seu plano?
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-background/40 px-4 py-3">
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
            Digite uma mensagem…
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 lg:px-8">
        <div className="animate-fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Chatbot + atendimento humano em um só lugar
          </div>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Atendimento que <span className="text-gradient">vende</span>.
            <br />
            Sem bloqueios. Sem limites.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            O Drax une <strong className="text-foreground">automação inteligente</strong> e{" "}
            <strong className="text-foreground">chat humano em tempo real</strong> numa
            plataforma única — supere as limitações do WhatsApp e do Typebot e converta mais
            todos os dias.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#planos">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90"
              >
                Começar agora <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </a>
            <a href="#planos">
              <Button size="lg" variant="outline" className="border-border bg-transparent">
                Ver planos
              </Button>
            </a>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6 max-w-md">
            <Stat value="+87%" label="Conversão" />
            <Stat value="24/7" label="Atendimento" />
            <Stat value="0" label="Bloqueios" />
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <ChatMockup />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-gradient">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative px-4 py-20 sm:px-6 md:py-28 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          {eyebrow && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">{title}</h2>
          {subtitle && (
            <p className="mt-4 text-lg text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function About() {
  return (
    <Section
      id="sobre"
      eyebrow="O que é o Drax"
      title={
        <>
          A evolução do <span className="text-gradient">Typebot</span>, com chat humano integrado.
        </>
      }
      subtitle="Crie fluxos automatizados como no Typebot, mas vá além: quando o lead precisa de um humano, sua equipe assume a conversa em tempo real — tudo no mesmo lugar, sem depender do WhatsApp."
    >
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Workflow,
            title: "Fluxos Intuitivos",
            text: "Seu atendimento de forma agradável e estimulante",
          },
          {
            icon: Headphones,
            title: "Humano em tempo real",
            text: "Assuma conversas com 1 clique, com histórico completo.",
          },
          {
            icon: ShieldCheck,
            title: "Sem bloqueios",
            text: "Plataforma própria. Sem risco de banimento.",
          },
          {
            icon: WhatsAppBrandIcon,
            title: "Integração com WhatsApp",
            text: "Se quiser, você pode direcionar o final do seu atendimento para um número de WhatsApp",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="border-gradient rounded-2xl p-6 transition-transform hover:-translate-y-1"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const BENEFITS = [
  {
    icon: Zap,
    title: "Automação completa",
    text: "Responda dúvidas, qualifique leads e agende reuniões 24/7 sem esforço.",
  },
  {
    icon: Users,
    title: "Atendimento híbrido",
    text: "Bot atende, humano assume. A transição é instantânea e invisível para o cliente.",
  },
  {
    icon: ShieldCheck,
    title: "Sem bloqueios",
    text: "Esqueça o medo do banimento do WhatsApp. Plataforma própria, estável e segura.",
  },
  {
    icon: TrendingUp,
    title: "+ Conversão",
    text: "Atendimento rápido e contextual transforma curiosos em clientes pagantes.",
  },
  {
    icon: LineChart,
    title: "Escalabilidade",
    text: "Atenda 10 ou 10.000 conversas simultâneas com a mesma performance.",
  },
];

function Benefits() {
  return (
    <Section
      id="beneficios"
      eyebrow="Benefícios"
      title={
        <>
          Por que empresas escolhem o <span className="text-gradient">Drax</span>
        </>
      }
      subtitle="Tudo que falta no WhatsApp e no Typebot, reunido em uma única plataforma profissional."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <div
            key={b.title}
            className="group relative overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-6 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
              <b.icon className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{b.title}</h3>
            <p className="text-sm text-muted-foreground">{b.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Criamos seus fluxos",
    text: "Em poucos minutos nossos especialistas deixam o seu fluxo pronto.",
  },
  {
    n: "02",
    title: "Publique no site",
    text: "Você pode integrar seu fluxo de atendimento diretamente no site da sua empresa",
  },
  { n: "03", title: "Bot atende", text: "Qualifica leads e responde 24/7 sozinho." },
  { n: "04", title: "Humano assume", text: "Sua equipe entra em tempo real e converte." },
];

function HowItWorks() {
  return (
    <Section
      id="como-funciona"
      eyebrow="Como funciona"
      title={
        <>
          Um time <span className="text-gradient">especializado</span> para você
        </>
      }
      subtitle="Seu setup e fluxos preparados por um time especializado e com muita prática de atendimento, tudo para deixar o seu atendimento com uma qualidade 5 estrelas!"
    >
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.n} className="relative">
            <div className="rounded-2xl border border-border bg-[var(--surface)] p-6 h-full">
              <div className="mb-4 text-3xl font-bold text-gradient">{s.n}</div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-primary/60 lg:block" />
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

const FEATURES = [
  {
    icon: Sparkles,
    title: "Excelente experiência",
    text: "Seu Lead com um atendimento excepcional.",
  },
  { icon: MessageSquare, title: "Chat em tempo real", text: "Conversas instantâneas com seus leads." },
  { icon: Users, title: "Gestão de leads", text: "CRM integrado: tags, notas e segmentos." },
  { icon: Headphones, title: "Atendimento simultâneo", text: "Múltiplos atendentes, infinitas conversas." },
  { icon: LineChart, title: "Analytics", text: "Métricas de conversão e performance da equipe." },
];

function Features() {
  return (
    <Section
      eyebrow="Funcionalidades"
      title={
        <>
          Tudo que você precisa para <span className="text-gradient">vender mais</span>
        </>
      }
      subtitle="Uma suíte completa de atendimento e automação, pensada para PMEs que querem crescer."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-[var(--surface)] p-6 transition-all hover:border-primary/40"
          >
            <f.icon className="mb-4 h-6 w-6 text-primary" />
            <h3 className="mb-1 text-lg font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const COMPARE_ROWS = [
  { feature: "Sem risco de bloqueio", drax: true, wpp: false, typebot: true },
  { feature: "Chatbot visual no-code", drax: true, wpp: false, typebot: true },
  { feature: "Chat humano em tempo real", drax: true, wpp: true, typebot: false },
  { feature: "Atendimento simultâneo ilimitado", drax: true, wpp: false, typebot: false },
  { feature: "Gestão de leads integrada", drax: true, wpp: false, typebot: false },
  { feature: "Escalável para alto volume", drax: true, wpp: false, typebot: true },
];

function Comparison() {
  return (
    <Section
      eyebrow="Comparação"
      title={
        <>
          Drax vs <span className="text-gradient">a concorrência</span>
        </>
      }
      subtitle="Veja por que o Drax é a escolha mais completa para seu atendimento."
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-[var(--surface)]">
        <div className="grid grid-cols-4 border-b border-border bg-background/40 text-sm font-semibold">
          <div className="p-4">Recurso</div>
          <div className="p-4 text-center text-primary">Drax</div>
          <div className="p-4 text-center text-muted-foreground">WhatsApp</div>
          <div className="p-4 text-center text-muted-foreground">Typebot</div>
        </div>
        {COMPARE_ROWS.map((r, i) => (
          <div
            key={r.feature}
            className={`grid grid-cols-4 items-center text-sm ${
              i % 2 === 0 ? "bg-transparent" : "bg-background/20"
            }`}
          >
            <div className="p-4">{r.feature}</div>
            <Cell yes={r.drax} highlight />
            <Cell yes={r.wpp} />
            <Cell yes={r.typebot} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Cell({ yes, highlight }: { yes: boolean; highlight?: boolean }) {
  return (
    <div className="p-4 text-center">
      {yes ? (
        <Check
          className={`mx-auto h-5 w-5 ${highlight ? "text-primary" : "text-success"}`}
        />
      ) : (
        <X className="mx-auto h-5 w-5 text-muted-foreground/50" />
      )}
    </div>
  );
}

const BUSINESS_FEATURES = [
  "Bots ilimitados",
  "Conversas ilimitadas",
  "Atendentes humanos ilimitados",
  "Excelente experiência: atendimento excepcional ao lead",
  "Chat humano em tempo real",
  "Gestão de leads (CRM integrado)",
  "Filtros e exportação para sua carteira de clientes",
  "Suporte via comunidade do WhatsApp",
  "Sem risco de bloqueios",
];

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", cpfCnpj: "", whatsapp: "" });
  const [paymentConfigured, setPaymentConfigured] = useState(true);
  const [monthly, setMonthly] = useState(290);
  const [yearlyTotal, setYearlyTotal] = useState(2280);

  useEffect(() => {
    void fetchSalesPlans()
      .then(({ plans, paymentConfigured: configured }) => {
        setPaymentConfigured(configured);
        const monthlyPlan = plans.find((plan) => plan.billingCycle === "MONTHLY");
        const yearlyPlan = plans.find((plan) => plan.billingCycle === "YEARLY");
        if (monthlyPlan) setMonthly(monthlyPlan.priceCents / 100);
        if (yearlyPlan) setYearlyTotal(yearlyPlan.priceCents / 100);
      })
      .catch(() => {
        // Mantém valores padrão da UI se a API estiver indisponível no carregamento.
      });
  }, []);

  const formatCurrency = (value: number): string =>
    value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const yearlyMonthly = (yearlyTotal / 12).toFixed(2).replace(".", ",");
  const savings = monthly * 12 - yearlyTotal;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentConfigured) {
      setError("Pagamentos temporariamente indisponíveis. Tente novamente em instantes.");
      return;
    }
    const docDigits = digitsFromCpfCnpj(form.cpfCnpj);
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo.");
      return;
    }
    const phoneDigits = digitsFromPhone(form.whatsapp);
    if (!isValidBrazilMobileDigits(phoneDigits)) {
      setError("Informe um celular válido com DDD (ex.: (11) 99999-9999).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createSalesSubscription({
        customerName: form.name,
        ownerEmail: form.email,
        cpfCnpj: digitsFromCpfCnpj(form.cpfCnpj),
        whatsapp: phoneDigits,
        cycle: yearly ? "YEARLY" : "MONTHLY",
      });
      if (res.invoiceUrl) {
        window.location.href = res.invoiceUrl;
      } else {
        setError(
          "Assinatura criada, mas não recebemos o link de cobrança. Verifique seu e-mail.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar assinatura.");
    } finally {
      setLoading(false);
    }
  };

  const featuresMid = Math.ceil(BUSINESS_FEATURES.length / 2);
  const featuresColLeft = BUSINESS_FEATURES.slice(0, featuresMid);
  const featuresColRight = BUSINESS_FEATURES.slice(featuresMid);

  return (
    <Section
      id="planos"
      eyebrow="Plano único"
      title={
        <>
          Tudo do Drax em um único <span className="text-gradient">plano Business</span>
        </>
      }
      subtitle="Sem fidelidade. Cancele quando quiser. Pague mensal ou anual com até 48% de economia."
    >
      <div className="mb-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-2">
        <span
          className={cn(
            "shrink-0 text-sm font-medium",
            !yearly ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Mensal
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          onClick={() => setYearly((v) => !v)}
          className={cn(
            "relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            yearly
              ? "border-primary/40 bg-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              : "border-border bg-secondary shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)]",
          )}
          aria-label="Alternar cobrança mensal ou anual"
        >
          <span
            className={cn(
              "pointer-events-none absolute left-[3px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-md ring-2 transition-transform duration-200 ease-out",
              yearly
                ? "translate-x-[26px] bg-primary-foreground ring-primary-foreground/25"
                : "translate-x-0 bg-foreground ring-background/30",
            )}
          />
        </button>
        <span
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium",
            yearly ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="shrink-0">Anual</span>
          <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary">
            {`economize R$${savings.toFixed(0)}`}
          </span>
        </span>
      </div>

      <div className="mx-auto max-w-xl">
        <div className="relative flex flex-col rounded-3xl border border-primary/60 bg-[var(--surface-elevated)] p-8 shadow-[var(--shadow-glow)] md:p-10">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-primary-glow px-3 py-1 text-xs font-semibold text-primary-foreground">
            Acesso completo
          </div>

          <h3 className="text-2xl font-bold">Business</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os recursos do Drax, sem limites.
          </p>

          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-bold">
              R$ {yearly ? yearlyMonthly : formatCurrency(monthly)}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          {yearly ? (
            <p className="mt-1 text-xs text-primary">
              R$ {formatCurrency(yearlyTotal)} cobrados anualmente
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">cobrança mensal recorrente</p>
          )}

          <div className="mt-6 grid flex-1 gap-6 sm:grid-cols-2 sm:items-start sm:gap-x-8 sm:gap-y-0">
            <ul className="flex flex-col gap-2.5">
              {featuresColLeft.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-2.5">
              {featuresColRight.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            size="lg"
            onClick={() => setOpen(true)}
            disabled={!paymentConfigured}
            className="mt-8 bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90"
          >
            Assinar agora <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          {!paymentConfigured ? (
            <p className="mt-3 text-center text-xs text-amber-400">
              Checkout em configuração. Aguarde alguns minutos ou fale com o suporte.
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Pagamento seguro processado via Asaas • Pix, boleto e cartão
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-6 sm:max-w-md">
          <DialogHeader className="space-y-2">
            <DialogTitle>Assinar plano Business</DialogTitle>
            <DialogDescription>
              {yearly
                ? `R$ ${formatCurrency(yearlyTotal)} cobrados anualmente (equivalente a R$ ${yearlyMonthly}/mês).`
                : `R$ ${formatCurrency(monthly)}/mês — cobrança recorrente.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubscribe} className="space-y-5">
            <div className="flex flex-col gap-3">
              <Label htmlFor="name" className="leading-normal">
                Nome completo
              </Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="email" className="leading-normal">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="cpfCnpj" className="leading-normal">
                CPF ou CNPJ
              </Label>
              <Input
                id="cpfCnpj"
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                maxLength={18}
                value={form.cpfCnpj}
                onChange={(e) =>
                  setForm({ ...form, cpfCnpj: maskCpfCnpjInput(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="whatsapp" className="leading-normal">
                Celular (WhatsApp)
              </Label>
              <Input
                id="whatsapp"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                maxLength={15}
                value={form.whatsapp}
                onChange={(e) =>
                  setForm({ ...form, whatsapp: maskBrazilMobileInput(e.target.value) })
                }
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text");
                  setForm({ ...form, whatsapp: maskBrazilMobileInput(pasted) });
                }}
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Processando…" : "Continuar para pagamento"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Você será redirecionado para o checkout seguro do Asaas.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

const FAQ_ITEMS = [
  {
    q: "O Drax substitui o WhatsApp?",
    a: "O Drax é uma alternativa ao WhatsApp para o atendimento no seu site, sem o risco de bloqueios. Você pode usar os dois em conjunto, mas muitas empresas migram 100% do atendimento para o Drax pela estabilidade e pelos recursos avançados.",
  },
  {
    q: "Preciso instalar algum software?",
    a: "Não. O Drax é 100% web. Basta criar sua conta, montar seu fluxo no editor visual e colar uma linha de código no seu site. Em minutos seu atendimento está no ar.",
  },
  {
    q: "Existe limite de atendentes ou conversas?",
    a: "Não. O plano Business inclui atendentes humanos, bots e conversas ilimitadas. A plataforma é projetada para escalar de 10 a 10.000+ conversas simultâneas com a mesma performance.",
  },
  {
    q: "É difícil de usar?",
    a: "Não. O editor de fluxos é drag-and-drop, sem necessidade de código. Qualquer pessoa da sua equipe consegue montar um bot funcional em poucos minutos.",
  },
  {
    q: "Posso integrar com meu CRM?",
    a: "Sim. O Drax oferece integrações nativas com os principais CRMs e ferramentas de marketing, além de webhooks e API aberta para integrações personalizadas.",
  },
  {
    q: "Como funciona o pagamento?",
    a: "O pagamento é mensal ou anual, processado de forma segura via Asaas (Pix, boleto ou cartão). Sem fidelidade — cancele quando quiser.",
  },
];

function FAQ() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title={
        <>
          Perguntas <span className="text-gradient">frequentes</span>
        </>
      }
    >
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-xl border border-border bg-[var(--surface)] px-5"
            >
              <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-primary/30 p-10 text-center md:p-16">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.82 0.15 185 / 0.20), transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Pronto para <span className="text-gradient">vender mais</span> sem bloqueios?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Junte-se às empresas que já trocaram o caos do WhatsApp pelo atendimento profissional do Drax.
          </p>
          <div className="mt-8">
            <a href="#planos">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90"
              >
                Começar agora <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center">
            <img
              src="/drax-logo-footer.png"
              alt="Drax"
              className="h-8 w-auto max-w-[128px] object-contain sm:h-9"
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Chatbot + chat humano em tempo real. Atendimento sem bloqueios.
          </p>
        </div>
        <FooterCol
          title="Produto"
          links={[
            { label: "Benefícios", href: "#beneficios" },
            { label: "Como funciona", href: "#como-funciona" },
            { label: "Planos", href: "#planos" },
          ]}
        />
        <FooterCol
          title="Empresa"
          links={[
            { label: "Sobre", href: "#sobre" },
            { label: "FAQ", href: "#faq" },
            { label: "Contato", href: "mailto:contato@drax.com.br" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { label: "Termos", href: "#" },
            { label: "Privacidade", href: "#" },
            { label: "Cookies", href: "#" },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Drax. Todos os direitos reservados.</span>
          <span>Feito com 💙 no Brasil</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 p-3 backdrop-blur md:hidden">
      <a href="#planos">
        <Button className="w-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
          Assinar agora <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </a>
    </div>
  );
}

function Index() {
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Header />
      <main>
        <Hero />
        <About />
        <Benefits />
        <HowItWorks />
        <Features />
        <Comparison />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileCTA />
    </div>
  );
}
