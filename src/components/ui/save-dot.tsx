/**
 * A small dot that shows while changes are waiting to be saved and goes once they are.
 * Its space is always kept, so nothing beside it moves as it comes and goes.
 */
export function SaveDot({
  pending,
  label,
  testId,
  status,
}: {
  pending: boolean;
  label: string;
  testId?: string;
  status?: string;
}) {
  return (
    <span role="status" className="inline-flex size-4 shrink-0 items-center justify-center">
      <span
        aria-hidden="true"
        title={label}
        data-testid={testId}
        data-status={status}
        className={`size-2 rounded-full bg-warning ${pending ? "" : "invisible"}`}
      />
      <span className="sr-only">{pending ? label : ""}</span>
    </span>
  );
}
