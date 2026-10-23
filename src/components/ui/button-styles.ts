export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium cursor-pointer " +
  "transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-raised",
  danger: "bg-danger text-on-danger hover:opacity-90",
  ghost: "text-ink hover:bg-surface-raised",
};

/** A button's classes, also for links that act as buttons (server or client). */
export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `${base} ${variants[variant]}`;
}
