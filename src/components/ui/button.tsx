"use client";

import { forwardRef } from "react";
import { buttonClass, type ButtonVariant } from "./button-styles";
import { Spinner } from "./spinner";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
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
      className={`${buttonClass(variant)} ${className ?? ""}`}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
});
