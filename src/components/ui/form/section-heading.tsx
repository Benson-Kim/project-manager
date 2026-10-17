/**
 * SectionHeading — lightweight visual divider used inside Sheets and Panels to
 * separate logically distinct groups of fields. Renders as an <h3> with a
 * bottom border; `action` puts a control at the right end of the same bar.
 */
export function SectionHeading({
  id,
  action,
  children,
}: {
  id?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const label = "text-xs font-semibold uppercase tracking-wide text-ink-muted";
  if (!action) {
    return (
      <h3 id={id} className={`mb-3 mt-5 border-b border-line px-4 py-3 first:mt-0 ${label}`}>
        {children}
      </h3>
    );
  }
  return (
    <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-line py-1.5 pl-4 pr-2 first:mt-0">
      <h3 id={id} className={`py-1.5 ${label}`}>
        {children}
      </h3>
      {action}
    </div>
  );
}
