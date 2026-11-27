"use client";

import { forwardRef, useState } from "react";
import { messages } from "@/lib/messages";
import { Input } from "./inputs";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password box with an eye button that shows what was typed until pressed again. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          spellCheck={false}
          className={`pr-10 ${className ?? ""}`}
          {...props}
        />
        <button
          type="button"
          aria-label={messages.auth.showPassword}
          aria-pressed={visible}
          data-testid="password-visibility"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex min-w-10 items-center justify-center rounded-r-md text-ink-muted hover:text-ink"
        >
          <EyeIcon open={!visible} />
        </button>
      </div>
    );
  },
);

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open ? null : <path d="M3 3l18 18" />}
    </svg>
  );
}
