import Link from "next/link";
import { messages } from "@/lib/messages";

/**
 * The way back from a full-route page (ADR-0010 exception) to its list: links
 * for the trail, plain text for the current page (aria-current).
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label={messages.nav.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-sm px-1 text-accent-strong hover:bg-surface-raised"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate px-1 text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
