"use client";

import { forwardRef } from "react";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium " +
  "transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-raised",
  danger: "bg-danger text-on-danger hover:opacity-90",
  ghost: "text-ink hover:bg-surface-raised",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows an inline spinner and disables the button (double-submit guard). */
  pending?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", pending = false, disabled, children, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || pending}
      className={`${base} ${variants[variant]} ${className ?? ""}`}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
});
