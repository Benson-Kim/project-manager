import { AvatarStack } from "@/components/ui/avatar-stack";
import { clampPercent, ProgressBar } from "@/components/ui/progress-bar";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { formatMoney } from "@/modules/financials/calc/money";

const M = messages.keyDeliverables.wbs.meta;

/** A budget for display: "1,234.50". */
export function budgetText(amount: number): string {
  return formatMoney(BigInt(Math.round(amount * 100)));
}

/** The facts under a box's name: who is on it, how far along it is, its budget and effort. */
export function BoxMeta({
  id,
  name,
  owners,
  people,
  work,
  progress,
  budget,
  effort,
}: {
  id: number;
  name: string;
  owners: readonly string[];
  /** The People toggle: show who is on the item. */
  people: boolean;
  /** The Details toggle: show work, budget and effort. */
  work: boolean;
  progress: number;
  budget: number | null;
  effort: number | null;
}) {
  return (
    <dl
      data-testid={`wbs-meta-${id}`}
      className="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-sm border border-line bg-surface px-2 py-1 text-xs font-normal text-ink-muted"
    >
      {people ? (
        <>
          <dt className="sr-only">{M.people}</dt>
          <dd
            data-testid={`wbs-assignees-${id}`}
            className="col-span-2 m-0 flex min-h-6 items-center"
          >
            <AvatarStack names={owners} emptyLabel={messages.keyDeliverables.unassigned} />
          </dd>
        </>
      ) : null}
      {work ? (
        <>
          <dt>{M.work}</dt>
          <dd className="m-0 flex">
            <ProgressBar value={progress} label={M.workOf(name)} className="flex-1" />
          </dd>
        </>
      ) : null}
      {work && budget !== null ? (
        <>
          <dt>{M.budget}</dt>
          <dd className="m-0 text-right text-ink tabular-nums">{budgetText(budget)}</dd>
        </>
      ) : null}
      {work && effort !== null ? (
        <>
          <dt>{M.effort}</dt>
          <dd className="m-0 text-right text-ink tabular-nums">{M.days(effort)}</dd>
        </>
      ) : null}
    </dl>
  );
}

/**
 * A box's facts in a bubble over its name, on hover and while the box has the keyboard focus. The
 * box's own label already speaks them, so the bubble is for the eye only.
 */
export function BoxTooltip({
  id,
  title,
  start,
  end,
  milestone,
  priority,
  progress,
  owners,
}: {
  id: number;
  title: string;
  start: Date | null;
  end: Date | null;
  milestone: boolean;
  priority: string | null;
  progress: number;
  owners: readonly string[];
}) {
  const K = messages.keyDeliverables;
  const dates = !start
    ? K.wbs.noDates
    : milestone || !end
      ? toDateInput(start)
      : K.wbs.dateRange(toDateInput(start), toDateInput(end));
  return (
    <span
      aria-hidden="true"
      data-testid={`wbs-tip-${id}`}
      className="pointer-events-none absolute bottom-full left-0 z-(--z-dropdown) mb-1 hidden w-64 max-w-[80vw] flex-col gap-0.5 rounded bg-ink px-2 py-1.5 text-xs font-normal whitespace-normal text-surface shadow-md wrap-anywhere group-hover/head:flex group-focus-visible/box:flex print:hidden"
    >
      <span className="font-semibold">{title}</span>
      <span className="tabular-nums">{dates}</span>
      <span>
        {K.priority}: {priority ?? "—"} · {M.work} {M.percent(clampPercent(progress))}
      </span>
      <span>{owners.length > 0 ? owners.join(", ") : K.unassigned}</span>
    </span>
  );
}

/** The whole plan's Work % and Budget, inside the project box. */
export function PlanMeta({ progress, budget }: { progress: number; budget: number | null }) {
  return (
    <dl
      data-testid="wbs-plan-meta"
      className="m-0 mt-1 flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-xs font-normal opacity-85"
    >
      <div className="flex gap-1">
        <dt>{M.work}</dt>
        <dd className="m-0 tabular-nums">{M.percent(clampPercent(progress))}</dd>
      </div>
      {budget !== null ? (
        <div className="flex gap-1">
          <dt>{M.budget}</dt>
          <dd className="m-0 tabular-nums">{budgetText(budget)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
