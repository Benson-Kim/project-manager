"use client";

import { forwardRef } from "react";
import { useFieldAria } from "./field";

/**
 * Native-first inputs (ADR-0005): the platform's controls are the best mobile
 * UX. All pick up id/aria wiring from the surrounding <Field>.
 */
const inputBase =
  "min-h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink " +
  "aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const aria = useFieldAria();
    return <input ref={ref} className={`${inputBase} ${className ?? ""}`} {...aria} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  const aria = useFieldAria();
  return (
    <textarea
      ref={ref}
      rows={props.rows ?? 4}
      className={`w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink aria-invalid:border-danger ${className ?? ""}`}
      {...aria}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    const aria = useFieldAria();
    return (
      <select ref={ref} className={`${inputBase} ${className ?? ""}`} {...aria} {...props}>
        {children}
      </select>
    );
  },
);

/** Native date input: OS picker on mobile, typed entry on desktop. */
export const DatePicker = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function DatePicker(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "role"
> {
  label: string;
}

/** Native checkbox styled as a switch; announced as a switch. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, ...props },
  ref,
) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 ${className ?? ""}`}
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="relative inline-flex">
        <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className="block h-6 w-10 rounded-full bg-ink-faint transition-colors duration-(--duration-fast) peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
        />
        <span
          aria-hidden="true"
          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface transition-transform duration-(--duration-fast) peer-checked:translate-x-4"
        />
      </span>
    </label>
  );
});
