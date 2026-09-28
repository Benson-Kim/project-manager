/**
 * SectionHeading — lightweight visual divider used inside Sheets to separate
 * logically distinct groups of fields. Renders as an <h3> with a bottom border.
 * No interactive behaviour; purely presentational.
 */
export function SectionHeading({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-3 mt-5 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted first:mt-0"
    >
      {children}
    </h3>
  );
}
