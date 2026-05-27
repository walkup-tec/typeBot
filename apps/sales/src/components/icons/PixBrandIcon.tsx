import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** Marca Pix simplificada (quatro losangos). */
export function PixBrandIcon({ className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      role="img"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path fill="#32BCAD" d="M13.5 24 4 14.5 9.5 9l9.5 9.5L28.5 9 34 14.5 24.5 24 34 33.5 28.5 39l-9.5-9.5L9.5 39 4 33.5z" />
      <path fill="#4DB6AC" d="M24 4 33.5 13.5 28 19l-4-4-4 4-5.5-5.5z" />
      <path fill="#4DB6AC" d="m24 44 9.5-9.5-5.5-5.5-4 4-4-4-5.5 5.5z" />
      <path fill="#81C784" d="M44 24 34.5 33.5 29 28l4-4-4-4 5.5-5.5z" />
      <path fill="#81C784" d="M4 24 13.5 14.5 19 20l-4 4 4 4-5.5 5.5z" />
    </svg>
  );
}
