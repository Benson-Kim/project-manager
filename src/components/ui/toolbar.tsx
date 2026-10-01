import { messages } from "@/lib/messages";

/**
 * Sticky list toolbar (STANDARDS §5.3/§6): search + filters + sort + view
 * toggle. Sticks under the app header; safe on 360 px (wraps in rows).
 */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div role="toolbar" aria-label={messages.app.filterAndSearch} className="sticky top-14 z-(--z-nav) -mx-4 flex flex-wrap items-center gap-2 bg-surface px-4 py-2">
      {children}
    </div>
  );
}
