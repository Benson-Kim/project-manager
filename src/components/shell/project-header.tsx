import Link from "next/link";
import { messages } from "@/lib/messages";

/**
 * Project workspace header (ADR-0018): breadcrumb `Projects / <name>` plus
 * status/priority badges. The page h1 stays the section name via PageHeader;
 * badge classes match the projects DataView card exactly. Rendered once by
 * projects/[id]/layout.tsx — section pages must not repeat it.
 */
function Badge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink">
      {value}
    </span>
  );
}

export function ProjectHeader({
  name,
  status,
  priority,
}: {
  name: string;
  status: string | null;
  priority: string | null;
}) {
  return (
    <header data-testid="project-header" className="flex flex-col gap-1 pt-4">
      <nav aria-label={messages.nav.breadcrumb} className="text-sm text-ink-muted">
        <ol className="flex items-center gap-1">
          <li>
            <Link href="/projects" className="underline underline-offset-2 hover:text-ink">
              {messages.projects.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="truncate">
            {name}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xl font-semibold text-ink sm:text-2xl" data-testid="project-header-name">
          {name}
        </p>
        <span className="flex flex-wrap gap-1.5">
          <Badge value={status} />
          <Badge value={priority} />
        </span>
      </div>
    </header>
  );
}
