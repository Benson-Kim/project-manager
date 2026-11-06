import Link from "next/link";
import type { ComponentProps } from "react";
import { messages } from "@/lib/messages";
import { TypeBadge } from "../requirement-chips";
import { RequirementLinks } from "../requirement-links";

const M = messages.requirements.canvas;

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-focus";

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** One requirement beside the canvas. Its links are edited exactly as on the register. */
export function CanvasInspector({
  projectId,
  closeHref,
  ...links
}: ComponentProps<typeof RequirementLinks> & { projectId: number; closeHref: string }) {
  const { requirement } = links;
  return (
    <aside
      data-testid="canvas-inspector"
      aria-label={M.inspector(requirement.Ref)}
      className="min-w-0 overflow-y-auto border-t border-line p-4 lg:border-t-0 lg:border-l"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <TypeBadge type={requirement.RequirementType} />
          {requirement.Ref}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/projects/${projectId}/requirements?id=${requirement.RequirementId}`}
            aria-label={M.openInRegister}
            title={M.openInRegister}
            data-testid="canvas-inspector-edit"
            className={iconButton}
          >
            <EditIcon />
          </Link>
          <Link
            href={closeHref}
            scroll={false}
            aria-label={M.closeInspector}
            title={M.closeInspector}
            data-testid="canvas-inspector-close"
            className={iconButton}
          >
            <CloseIcon />
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{requirement.Requirement}</p>
      <div className="mt-4">
        <RequirementLinks {...links} />
      </div>
    </aside>
  );
}
