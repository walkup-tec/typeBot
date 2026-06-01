import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSalesOrderStatus } from "@/lib/salesApi";
import { resolvePainelUrl } from "@/lib/salesApi";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pagamento")({
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: String(search.orderId ?? "").trim(),
  }),
  component: PagamentoPixPage,
});

function PagamentoPixPage() {
  const { orderId } = Route.useSearch();
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState("");
  const [status, setStatus] = useState("pending_payment");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const qrImageSrc = useMemo(() => {
    if (pixQrCodeBase64) return pixQrCodeBase64;
    if (!pixCopyPaste) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(pixCopyPaste)}`;
  }, [pixCopyPaste, pixQrCodeBase64]);

  useEffect(() => {
    if (!orderId) {
      setError("Pedido inválido. Volte aos planos e tente novamente.");
      return;
    }

    const cached = sessionStorage.getItem(`pix-pay-${orderId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { pixCopyPaste?: string; pixQrCodeBase64?: string };
        if (parsed.pixCopyPaste) setPixCopyPaste(parsed.pixCopyPaste);
        if (parsed.pixQrCodeBase64) setPixQrCodeBase64(parsed.pixQrCodeBase64);
      } catch {
        // ignora cache inválido
      }
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const current = await fetchSalesOrderStatus(orderId);
        if (cancelled) return;
        setStatus(current.status);
        if (current.pixCopyPaste) setPixCopyPaste(current.pixCopyPaste);
        if (current.pixQrCodeBase64) setPixQrCodeBase64(current.pixQrCodeBase64);
        if (current.status === "provisioned") {
          const painel = resolvePainelUrl();
          if (painel) {
            window.location.href = painel;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível consultar o pagamento.");
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId]);

  const handleCopy = async () => {
    if (!pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o código Pix. Copie manualmente o campo abaixo.");
    }
  };

  if (!orderId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild>
          <Link to="/">Voltar aos planos</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Pague com Pix Automático</h1>
        <p className="text-sm text-muted-foreground">
          Escaneie o QR Code ou copie o código. Na 1ª cobrança você autoriza os débitos mensais automáticos no app do
          banco.
        </p>
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p> : null}

      {qrImageSrc ? (
        <div className="flex justify-center">
          <img src={qrImageSrc} alt="QR Code Pix" className="h-[280px] w-[280px] rounded-lg border bg-white p-2" />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gerando QR Code Pix…
        </div>
      )}

      {pixCopyPaste ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Pix copia e cola</label>
          <textarea
            readOnly
            value={pixCopyPaste}
            className="min-h-[96px] w-full resize-none rounded-md border bg-secondary/30 p-3 text-xs leading-relaxed"
          />
          <Button type="button" className="w-full" onClick={() => void handleCopy()}>
            {copied ? "Copiado!" : "Copiar código Pix"}
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border border-border/70 bg-secondary/20 px-3 py-2 text-center text-xs text-muted-foreground">
        {status === "provisioned" ? (
          "Pagamento confirmado. Redirecionando para o painel…"
        ) : (
          <>
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
            Aguardando confirmação do pagamento…
          </>
        )}
      </div>

      <Button variant="outline" asChild>
        <Link to="/">Voltar aos planos</Link>
      </Button>
    </main>
  );
}
