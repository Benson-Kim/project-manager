import { SectionHeading } from "./form/section-heading";

/**
 * A titled card, the project overview's look (charter form): a bordered,
 * softly shaded box with the section heading as its top bar. `action` sits at
 * the right end of that bar.
 */
export function Panel({
  id,
  title,
  action,
  className,
  testId,
  children,
}: {
  id: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className={`flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)] ${className ?? ""}`}
    >
      <SectionHeading id={id} action={action}>
        {title}
      </SectionHeading>
      <div className="flex flex-col gap-4 px-4 py-3">{children}</div>
    </section>
  );
}
