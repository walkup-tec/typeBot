import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

type ClientsTableScrollAreaProps = {
  children: ReactNode;
};

/**
 * Área da tabela com scroll vertical no corpo e barra horizontal fixa sempre visível na base.
 */
export function ClientsTableScrollArea({ children }: ClientsTableScrollAreaProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const syncSpacerWidth = useCallback(() => {
    const inner = innerRef.current;
    const spacer = spacerRef.current;
    if (!inner || !spacer) return;
    spacer.style.width = `${inner.scrollWidth}px`;
  }, []);

  const applyHorizontalOffset = useCallback((scrollLeft: number) => {
    if (innerRef.current) {
      innerRef.current.style.transform = scrollLeft > 0 ? `translateX(-${scrollLeft}px)` : "";
    }
  }, []);

  useLayoutEffect(() => {
    syncSpacerWidth();
    const inner = innerRef.current;
    const main = mainRef.current;
    if (!inner || !main) return;

    const observer = new ResizeObserver(() => {
      syncSpacerWidth();
      if (barRef.current) {
        applyHorizontalOffset(barRef.current.scrollLeft);
      }
    });
    observer.observe(inner);
    observer.observe(main);

    const onWindowResize = () => syncSpacerWidth();
    window.addEventListener("resize", onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [applyHorizontalOffset, children, syncSpacerWidth]);

  const handleBarScroll = () => {
    const scrollLeft = barRef.current?.scrollLeft ?? 0;
    applyHorizontalOffset(scrollLeft);
  };

  return (
    <div className="clients-table-shell">
      <div ref={mainRef} className="clients-table-main-scroll">
        <div ref={innerRef} className="clients-table-inner-track">
          {children}
        </div>
      </div>
      <div
        ref={barRef}
        className="clients-table-h-scroll"
        onScroll={handleBarScroll}
        aria-label="Rolagem horizontal da tabela de clientes"
        tabIndex={0}
      >
        <div ref={spacerRef} className="clients-table-h-scroll-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
