"use client";

import { accountableRole } from "@/modules/stakeholders/schemas/responsibility-frameworks";
import { useMemo } from "react";
import { useLookupLists } from "@/components/ui/lookup-lists";
import { TONES } from "@/components/ui/tones";
import { optionColor, type LookupList } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { diagramFramework, type BpmnDiagram, type BpmnShape } from "../model/diagram";
import { diagramSteps, stepsByRole } from "../model/steps";

const M = messages.bpmn;
const S = M.stepViews;
const I = M.inspector;

interface StepViewProps {
  diagram: BpmnDiagram;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const stepName = (shape: BpmnShape) => shape.label.trim() || M.shapes[shape.kind];
const useStatuses = () => useLookupLists().lists["bpmn.step-status"];

const statusText = (statuses: LookupList | undefined, shape: BpmnShape) =>
  statuses?.options.find((option) => String(option.id) === shape.step?.status)?.label ?? "";

/** A matrix row takes its status colour when the status list colours rows. */
function rowTone(statuses: LookupList | undefined, shape: BpmnShape): string {
  const color = statuses?.tintRows ? optionColor(statuses, shape.step?.status) : null;
  return color ? TONES[color].fill : "";
}

function Empty() {
  return <p className="p-4 text-sm text-ink-muted">{S.empty}</p>;
}

/** The steps grouped by who does them, each group read left to right. */
export function SwimlaneView({ diagram, selectedId, onSelect }: StepViewProps) {
  const groups = useMemo(() => stepsByRole(diagramSteps(diagram)), [diagram]);
  const statuses = useStatuses();
  if (groups.length === 0) return <Empty />;
  return (
    <div data-testid="bpmn-swimlanes" className="flex flex-col gap-2 p-2">
      {groups.map((group) => (
        <section
          key={group.role ?? ""}
          data-testid="bpmn-swimlane"
          data-role={group.role ?? ""}
          aria-label={group.role ?? S.noRole}
          className="flex flex-col gap-2 rounded-md border border-line p-2 sm:flex-row sm:items-center"
        >
          <h3 className="shrink-0 text-xs font-semibold text-ink sm:w-32">
            {group.role ?? S.noRole}
          </h3>
          <ol className="flex flex-wrap items-center gap-1">
            {group.steps.map((row, index) => (
              <li key={row.shape.id} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="text-ink-muted">
                    →
                  </span>
                ) : null}
                <button
                  type="button"
                  data-testid="bpmn-step-card"
                  data-id={row.shape.id}
                  aria-pressed={row.shape.id === selectedId}
                  onClick={() => onSelect(row.shape.id)}
                  className={`flex min-w-28 flex-col items-start rounded-md border bg-surface-raised px-2 py-1 text-left text-xs text-ink focus-visible:border-accent focus-visible:outline-none ${
                    row.shape.id === selectedId ? "border-accent" : "border-line"
                  }`}
                >
                  <span className="font-medium">{stepName(row.shape)}</span>
                  <span className="text-[11px] text-ink-muted">
                    {[M.shapes[row.shape.kind], statusText(statuses, row.shape)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const CELL = "border-b border-line px-2 py-1 text-left align-top";

/** Every step as a row: who does it, who holds each role of the diagram's model, its timing. */
export function MatrixView({ diagram, selectedId, onSelect }: StepViewProps) {
  const steps = useMemo(() => diagramSteps(diagram), [diagram]);
  const statuses = useStatuses();
  const accountable = accountableRole(diagramFramework(diagram));
  if (steps.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto p-2">
      <table data-testid="bpmn-matrix" className="w-full border-collapse text-xs text-ink">
        <thead className="text-ink-muted">
          <tr>
            <th className={CELL}>{S.step}</th>
            <th className={CELL}>{I.fields.role}</th>
            <th className={CELL}>{accountable.label}</th>
            <th className={CELL}>{I.fields.duration}</th>
            <th className={CELL}>{I.fields.sla}</th>
            <th className={CELL}>{I.status}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((row) => (
            <tr
              key={row.shape.id}
              data-testid="bpmn-matrix-row"
              data-id={row.shape.id}
              onClick={() => onSelect(row.shape.id)}
              className={`cursor-pointer transition-colors duration-(--duration-fast) ${
                row.shape.id === selectedId
                  ? "bg-accent-soft"
                  : `${rowTone(statuses, row.shape)} hover:bg-surface-raised`
              }`}
            >
              <td className={CELL}>
                <button
                  type="button"
                  aria-pressed={row.shape.id === selectedId}
                  className="text-left font-medium focus-visible:outline-accent"
                >
                  {stepName(row.shape)}
                </button>
                <div className="text-[11px] text-ink-muted">{M.shapes[row.shape.kind]}</div>
              </td>
              <td className={CELL}>{row.role ?? ""}</td>
              <td className={CELL}>{row.shape.step?.people?.[accountable.code] ?? ""}</td>
              <td className={CELL}>{row.shape.step?.duration ?? ""}</td>
              <td className={CELL}>{row.shape.step?.sla ?? ""}</td>
              <td className={CELL}>{statusText(statuses, row.shape)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
