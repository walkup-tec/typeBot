import { CreditCard } from "lucide-react";
import { PixBrandIcon } from "@/components/icons/PixBrandIcon";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SalesBillingType = "PIX" | "CREDIT_CARD";

type Props = {
  value: SalesBillingType | null;
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
    <div className="flex flex-col gap-2">
      <Label className="leading-normal">Forma de pagamento</Label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
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
                "flex min-h-[62px] items-center gap-1.5 rounded-md border px-2 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/80 bg-secondary/25 hover:border-primary/30 hover:bg-secondary/45",
              )}
            >
              {option.id === "PIX" ? (
                <PixBrandIcon className="h-5 w-5" />
              ) : (
                <CreditCard
                  className={cn("h-5 w-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={1.75}
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-xs font-medium", selected && "text-foreground")}>
                  {option.title}
                </span>
                <span className="text-[9px] leading-tight text-muted-foreground">
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
