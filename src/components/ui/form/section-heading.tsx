import type { ReactNode } from "react";

/**
 * Shared section heading for Sheet forms and full-page forms.
 * No "use client" directive — compatible with Server and Client component trees.
 * Renders an h2 with a bottom border; pass className for variant styles
 * (e.g. the charter form uses "rounded-t-md text-base bg-surface-sunken").
 *
 * The `id` prop is used for `aria-labelledby` on the enclosing `<section>`.
 * Each rendered instance on a page must use a unique id string.
 */
export function SectionHeading({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={`border-b border-line px-4 py-2 text-sm font-semibold text-ink${className ? ` ${className}` : ""}`}
    >
      {children}
    </h2>
  );
}
