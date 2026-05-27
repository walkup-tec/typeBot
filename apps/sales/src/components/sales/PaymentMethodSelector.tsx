import { CreditCard } from "lucide-react";
import { PixBrandIcon } from "@/components/icons/PixBrandIcon";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SalesBillingType = "PIX" | "CREDIT_CARD";

type Props = {
  value: SalesBillingType;
  onChange: (value: SalesBillingType) => void;
};

const OPTIONS: Array<{
  id: SalesBillingType;
  title: string;
  subtitle: string;
}> = [
  { id: "PIX", title: "Pix", subtitle: "Pagamento instantâneo" },
  { id: "CREDIT_CARD", title: "Cartão", subtitle: "Crédito recorrente" },
];

export function PaymentMethodSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Label className="leading-normal">Forma de pagamento</Label>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Forma de pagamento">
        {OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary bg-primary/10 shadow-[0_0_0_1px_oklch(0.82_0.15_185_/_35%)]"
                  : "border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary/70",
              )}
            >
              {option.id === "PIX" ? (
                <PixBrandIcon className="h-9 w-9" />
              ) : (
                <CreditCard
                  className={cn("h-9 w-9", selected ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={1.75}
                />
              )}
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-sm font-semibold", selected && "text-foreground")}>
                  {option.title}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {option.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
