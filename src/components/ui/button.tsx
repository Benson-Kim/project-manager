"use client";

import { forwardRef } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-styles";
import { Spinner } from "./spinner";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows an inline spinner and disables the button (double-submit guard). */
  pending?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size, pending = false, disabled, children, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || pending}
      className={`${buttonClass(variant, size)} ${className ?? ""}`}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
});
