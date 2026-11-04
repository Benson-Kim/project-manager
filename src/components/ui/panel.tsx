import { SectionHeading } from "./form/section-heading";
import { PanelDisclosure } from "./panel-disclosure";
import { PANEL_BODY, PANEL_SHELL } from "./panel-styles";

/**
 * A titled card, the project overview's look (charter form): a bordered,
 * softly shaded box with the section heading as its top bar. `action` sits at
 * the right end of that bar.
 *
 * `collapsible` turns that bar into a disclosure button — the client's "sections
 * that expand if the person wants to write more". The body is hidden, never
 * unmounted, so a field inside a folded section still submits its value, and
 * open/closed is the viewer's own chrome: nothing about it is stored.
 */
export function Panel({
  id,
  title,
  action,
  className,
  testId,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  testId?: string;
  collapsible?: boolean;
  /** Collapsible panels only: whether it starts open. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  if (collapsible) {
    return (
      <PanelDisclosure
        id={id}
        title={title}
        action={action}
        className={className}
        testId={testId}
        defaultOpen={defaultOpen}
      >
        {children}
      </PanelDisclosure>
    );
  }
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className={`${PANEL_SHELL} ${className ?? ""}`}
    >
      <SectionHeading id={id} action={action}>
        {title}
      </SectionHeading>
      <div className={PANEL_BODY}>{children}</div>
    </section>
  );
}
