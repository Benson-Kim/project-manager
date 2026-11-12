/**
 * primary = the main action, filled with the brand blue; secondary and ghost = neutral actions;
 * danger = a delete or remove action, red outline that fills on hover; destructive = the solid
 * red that confirms one (in the confirm dialog).
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "destructive" | "ghost";
/** compact = a toolbar's 32 px row (boards, work breakdown); default keeps the 40 px target. */
export type ButtonSize = "default" | "compact";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium cursor-pointer " +
  "transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  default: "min-h-10 px-4",
  compact: "min-h-8 px-3 whitespace-nowrap",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-sm shadow-primary/25 hover:bg-primary-hover active:bg-primary-active",
  secondary: "border border-line bg-surface text-ink shadow-xs hover:bg-hover active:bg-hover",
  danger:
    "border border-danger/40 bg-surface text-danger hover:border-danger hover:bg-danger-soft active:bg-danger-soft",
  destructive: "bg-danger text-on-danger shadow-sm hover:bg-danger-hover active:bg-danger-hover",
  ghost: "text-ink hover:bg-hover active:bg-hover",
};

/** A button's classes, also for links that act as buttons (server or client). */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
): string {
  return `${base} ${sizes[size]} ${variants[variant]}`;
}
