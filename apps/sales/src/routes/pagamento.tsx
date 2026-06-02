import { createFileRoute } from "@tanstack/react-router";
import { PagamentoPixContent } from "@/components/sales/PagamentoPixContent";

export const Route = createFileRoute("/pagamento")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: String(search.orderId ?? "").trim(),
  }),
  component: PagamentoPage,
});

function PagamentoPage() {
  const { orderId } = Route.useSearch();
  return <PagamentoPixContent orderId={orderId} />;
}
