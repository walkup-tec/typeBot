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

  const syncHorizontalScroll = useCallback(() => {
    const inner = innerRef.current;
    const main = mainRef.current;
    const bar = barRef.current;
    const spacer = spacerRef.current;
    if (!inner || !main || !bar || !spacer) return;

    const needsHorizontal = inner.scrollWidth > main.clientWidth + 1;
    bar.hidden = !needsHorizontal;
    spacer.style.width = needsHorizontal ? `${inner.scrollWidth}px` : "0";

    if (!needsHorizontal) {
      bar.scrollLeft = 0;
      inner.style.transform = "";
    }
  }, []);

  const applyHorizontalOffset = useCallback((scrollLeft: number) => {
    if (innerRef.current) {
      innerRef.current.style.transform = scrollLeft > 0 ? `translateX(-${scrollLeft}px)` : "";
    }
  }, []);

  useLayoutEffect(() => {
    syncHorizontalScroll();
    const inner = innerRef.current;
    const main = mainRef.current;
    if (!inner || !main) return;

    const observer = new ResizeObserver(() => {
      syncHorizontalScroll();
      if (barRef.current && !barRef.current.hidden) {
        applyHorizontalOffset(barRef.current.scrollLeft);
      }
    });
    observer.observe(inner);
    observer.observe(main);

    const onWindowResize = () => syncHorizontalScroll();
    window.addEventListener("resize", onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [applyHorizontalOffset, children, syncHorizontalScroll]);

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
