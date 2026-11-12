import { messages } from "@/lib/messages";

/**
 * Sticky list toolbar: search + filters + sort + view
 * toggle. Sticks under the app header, or at the top while a full-screen view hides that header
 * (app-shell.tsx); safe on 360 px (wraps in rows).
 */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={messages.app.filterAndSearch}
      className="sticky top-14 z-(--z-nav) -mx-4 flex flex-wrap items-center gap-2 bg-surface px-4 py-2 [:root:fullscreen_&]:top-0 [:root[data-canvas-fullscreen]_&]:top-0"
    >
      {children}
    </div>
  );
}
