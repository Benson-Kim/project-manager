export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
/** compact = a toolbar's 32 px row (boards, work breakdown); default keeps the 40 px target. */
export type ButtonSize = "default" | "compact";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium cursor-pointer " +
  "transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  default: "min-h-10 px-4",
  compact: "min-h-8 px-3 whitespace-nowrap",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-raised",
  danger: "bg-danger text-on-danger hover:opacity-90",
  ghost: "text-ink hover:bg-surface-raised",
};

/** A button's classes, also for links that act as buttons (server or client). */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
): string {
  return `${base} ${sizes[size]} ${variants[variant]}`;
}
