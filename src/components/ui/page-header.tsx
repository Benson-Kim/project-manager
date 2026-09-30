/**
 * The ONE page anatomy header (STANDARDS §5.3): h1 + optional primary action.
 * Toolbar (search/filter/sort/view) renders below it via <Toolbar>.
 */
export function PageHeader({ title, action }: { title?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
