"use client";

import { useId, useState } from "react";
import { Chevron } from "./chevron";
import { SectionHeading } from "./form/section-heading";
import { PANEL_BODY, PANEL_CLOSED, PANEL_SHELL } from "./panel-styles";

/**
 * The collapsible shape of Panel (use `Panel collapsible`, not this directly):
 * the heading bar becomes the disclosure button, with the native button keyboard
 * contract — Enter and Space toggle, aria-expanded carries the state.
 *
 * The body is hidden rather than unmounted, so every field inside a folded
 * section is still in the form and still submits. Open/closed is the viewer's
 * chrome and is deliberately not persisted anywhere.
 */
export function PanelDisclosure({
  id,
  title,
  action,
  className,
  testId,
  defaultOpen,
  children,
}: {
  id: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  testId?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${useId()}-body`;

  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className={`${PANEL_SHELL} ${open ? "" : PANEL_CLOSED} ${className ?? ""}`}
    >
      <SectionHeading id={id} action={action}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((shown) => !shown)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 text-left focus-visible:outline-2 focus-visible:outline-focus"
        >
          {title}
          <Chevron open={open} />
        </button>
      </SectionHeading>
      <div id={bodyId} hidden={!open} className={PANEL_BODY}>
        {children}
      </div>
    </section>
  );
}
