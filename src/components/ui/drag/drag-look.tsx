/** An item whose lifted copy is away holds its place like this: dashed and faded. */
export const DRAG_SOURCE = "border-dashed border-ink-muted bg-surface-raised opacity-40";

/**
 * The grip a touch drag starts from; a mouse or pen drags the whole item. The caller places it.
 */
export function DragHandle({ label, className }: { label: string; className: string }) {
  return (
    <button
      type="button"
      data-drag-handle
      aria-label={label}
      className={`flex touch-none cursor-grab items-center justify-center text-xs text-ink-muted hover:bg-surface-raised ${className}`}
    >
      ⠿
    </button>
  );
}
