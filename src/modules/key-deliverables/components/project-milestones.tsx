import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { milestoneWords, type MilestoneChip } from "../schemas/wbs-milestones";

const P = messages.projects;
const K = messages.keyDeliverables;
const CELL = "border-b border-line px-2 py-2 text-left align-top";

/**
 * The project's milestones on its Overview: the name, the day it is aimed at, the day it was
 * reached and its status in milestone words, each opening the deliverable it is. They are the work breakdown's
 * milestones, not a second list, so the WBS and the Overview never disagree.
 */
export function ProjectMilestones({
  projectId,
  chips,
}: {
  projectId: number;
  chips: readonly MilestoneChip[];
}) {
  const base = `/projects/${projectId}/deliverables`;
  return (
    <Panel
      id="project-milestones-heading"
      title={P.milestonesSection}
      testId="project-milestones"
      action={
        <Link href={`${base}/gantt?view=wbs`} className="text-sm text-accent">
          {K.ganttLink}
        </Link>
      }
    >
      {chips.length === 0 ? (
        <p className="text-sm text-ink-muted">{P.milestonesEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className={`${CELL} font-medium`}>
                  {P.milestoneName}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {P.milestoneTarget}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {K.actualDate}
                </th>
                <th scope="col" className={`${CELL} font-medium`}>
                  {P.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {chips.map((chip) => (
                <tr key={chip.id}>
                  <th scope="row" className={`${CELL} font-normal`}>
                    <Link href={`${base}?d=${chip.id}`} className="text-accent">
                      {chip.code} {chip.name || K.deliverableFallback(chip.id)}
                    </Link>
                  </th>
                  <td className={`${CELL} tabular-nums`}>{formatDate(chip.date)}</td>
                  <td className={`${CELL} tabular-nums`}>{formatDate(chip.actual)}</td>
                  <td
                    className={`${CELL} ${chip.phase === "cancelled" ? "text-ink-muted" : ""}`}
                    data-testid="project-milestone-status"
                    data-phase={chip.phase ?? ""}
                  >
                    {milestoneWords(chip.status)}
                    {chip.state === "overdue" ? (
                      <span className="ml-2 font-medium text-danger">{P.milestoneOverdue}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
