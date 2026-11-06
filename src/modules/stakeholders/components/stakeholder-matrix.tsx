"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { placeStakeholderAction } from "../actions";
import {
  STAKEHOLDER_DRAG_MIME,
  STANCES,
  isPlaced,
  quadrantOf,
  summarise,
  toCsv,
  type MatrixStakeholder,
} from "../matrix";
import type { StakeholderMatrixRow } from "../schemas/stakeholder";
import { MatrixGrid } from "./matrix-grid";

const S = messages.stakeholders;

interface Saved {
  power: number | null;
  interest: number | null;
  rowVer: number;
}

function toRow(row: StakeholderMatrixRow): MatrixStakeholder {
  return {
    id: row.StakeholderId,
    name: [row.FirstName, row.LastName].filter(Boolean).join(" "),
    role: row.ProjectRole ?? "",
    stance: row.Stance,
    power: row.Power,
    interest: row.Interest,
    plan: row.KeyMessageStrategy ?? "",
  };
}

function firstError(error: { message: string; fieldErrors?: Record<string, string[]> }): string {
  return (error.fieldErrors && Object.values(error.fieldErrors).flat()[0]) || error.message;
}

function place(
  rows: readonly MatrixStakeholder[],
  id: number,
  power: number | null,
  interest: number | null,
): MatrixStakeholder[] {
  return rows.map((row) => (row.id === id ? { ...row, power, interest } : row));
}

const percent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;

/**
 * One project's register on the power/interest grid. A move shows at once and is saved with the
 * stakeholder's row version; saves run one after another, so each carries the version the last
 * one took back. A refusal puts the dot back, says why and fetches the page again.
 */
export function StakeholderMatrix({
  projectId,
  register,
  canEdit,
}: {
  projectId: number;
  register: readonly StakeholderMatrixRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [source, setSource] = useState(register);
  const [rows, setRows] = useState(() => register.map(toRow));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const saved = useRef(new Map<number, Saved>());
  const queue = useRef(Promise.resolve());

  if (source !== register) {
    setSource(register);
    setRows(register.map(toRow));
  }

  useEffect(() => {
    const next = new Map<number, Saved>();
    for (const row of register) {
      const known = saved.current.get(row.StakeholderId);
      next.set(
        row.StakeholderId,
        known && known.rowVer > row.RowVer
          ? known
          : { power: row.Power, interest: row.Interest, rowVer: row.RowVer },
      );
    }
    saved.current = next;
  }, [register]);

  const summary = useMemo(() => summarise(rows), [rows]);
  const placed = rows.filter(isPlaced);
  const unplaced = rows.filter((row) => !isPlaced(row));
  const sheetHref = (id: number) => `/projects/${projectId}/stakeholders/matrix?id=${id}`;

  function refuse(id: number, title: string) {
    const was = saved.current.get(id);
    if (was) setRows((current) => place(current, id, was.power, was.interest));
    toast({ variant: "error", title });
  }

  async function save(id: number, power: number, interest: number) {
    const was = saved.current.get(id);
    if (!was) return;
    let result: Awaited<ReturnType<typeof placeStakeholderAction>>;
    try {
      result = await placeStakeholderAction({
        stakeholderId: id,
        power,
        interest,
        rowVer: was.rowVer,
      });
    } catch {
      refuse(id, messages.errors.INTERNAL);
      return;
    }
    if (result.ok) {
      saved.current.set(id, { power, interest, rowVer: result.data.RowVer });
      return;
    }
    refuse(id, firstError(result.error));
    router.refresh();
  }

  function move(id: number, power: number, interest: number) {
    setRows((current) => place(current, id, power, interest));
    queue.current = queue.current.then(() => save(id, power, interest));
  }

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(toCsv(rows));
      toast({ variant: "success", title: S.matrix.copied });
    } catch {
      toast({ variant: "error", title: messages.errors.INTERNAL });
    }
  }

  const stats: { id: string; label: string; value: string; hint?: string }[] = [
    { id: "alignment", label: S.matrix.alignment, value: percent(summary.alignment, 1) },
    { id: "detractors", label: S.matrix.detractors, value: String(summary.detractors) },
    {
      id: "detractor-share",
      label: S.matrix.detractorShare,
      value: percent(summary.detractorShare, 1),
      hint: S.matrix.powerPoints(summary.detractorPower, summary.powerTotal),
    },
    { id: "champions", label: S.matrix.champions, value: String(summary.byStance.Champion) },
    { id: "unplanned", label: S.matrix.unplanned, value: String(summary.unplanned) },
    { id: "coverage", label: S.matrix.coverage, value: percent(summary.coverage) },
  ];
  const withStance = STANCES.reduce((count, stance) => count + summary.byStance[stance], 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <MatrixGrid
          rows={placed}
          summary={summary}
          selectedId={selectedId}
          canEdit={canEdit}
          onSelect={setSelectedId}
          onMove={move}
        />
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {stats.map((stat) => (
              <div
                key={stat.id}
                className="rounded-md border border-line bg-surface p-2"
                data-testid={`matrix-${stat.id}`}
              >
                <dt className="text-xs font-semibold text-ink-muted">{stat.label}</dt>
                <dd className="font-mono text-lg text-ink">{stat.value}</dd>
                {stat.hint ? <dd className="text-xs text-ink-muted">{stat.hint}</dd> : null}
              </div>
            ))}
          </dl>
          <section aria-labelledby="matrix-by-stance" data-testid="matrix-by-stance">
            <h2 id="matrix-by-stance" className="text-sm font-semibold text-ink">
              {S.matrix.byStance}
            </h2>
            <ul className="mt-1 flex flex-col gap-1">
              {STANCES.map((stance) => (
                <li key={stance} className="flex items-center gap-2 text-xs">
                  <span className="w-20 flex-none text-ink-muted">{S.stances[stance]}</span>
                  <span
                    aria-hidden="true"
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <span
                      className="block h-full rounded-full bg-ink-muted"
                      style={{
                        width: `${withStance ? (summary.byStance[stance] / withStance) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 flex-none text-right font-mono text-ink">
                    {summary.byStance[stance]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <button
            type="button"
            data-testid="matrix-copy-csv"
            onClick={copyCsv}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
          >
            {S.matrix.copyCsv}
          </button>
          {unplaced.length > 0 ? (
            <section aria-labelledby="matrix-not-placed" data-testid="matrix-not-placed">
              <h2 id="matrix-not-placed" className="text-sm font-semibold text-ink">
                {S.matrix.notPlaced} ({unplaced.length})
              </h2>
              {canEdit ? <p className="mt-1 text-xs text-ink-muted">{S.matrix.placeHint}</p> : null}
              <ul className="mt-1 flex flex-col gap-1">
                {unplaced.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={sheetHref(row.id)}
                      scroll={false}
                      draggable={canEdit}
                      onDragStart={
                        canEdit
                          ? (event) => {
                              event.dataTransfer.setData(STAKEHOLDER_DRAG_MIME, String(row.id));
                              event.dataTransfer.effectAllowed = "move";
                            }
                          : undefined
                      }
                      className={`text-sm text-ink underline-offset-2 hover:underline ${
                        canEdit ? "cursor-grab" : ""
                      }`}
                    >
                      {row.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm" data-testid="matrix-register">
          <thead className="bg-surface-sunken text-left text-xs font-semibold text-ink-muted">
            <tr>
              <th className="px-3 py-2">{S.name}</th>
              <th className="px-3 py-2">{S.projectRole}</th>
              <th className="px-3 py-2">{S.stance}</th>
              <th className="px-3 py-2 text-right">{S.power}</th>
              <th className="px-3 py-2 text-right">{S.interest}</th>
              <th className="px-3 py-2">{S.matrix.quadrant}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-line ${row.id === selectedId ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-3 py-2">
                  <Link
                    href={sheetHref(row.id)}
                    scroll={false}
                    data-testid={`matrix-row-${row.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-muted">{row.role}</td>
                <td className="px-3 py-2 text-ink">{row.stance ? S.stances[row.stance] : ""}</td>
                <td className="px-3 py-2 text-right font-mono text-ink">{row.power ?? ""}</td>
                <td className="px-3 py-2 text-right font-mono text-ink">{row.interest ?? ""}</td>
                <td className="px-3 py-2 text-ink">
                  {isPlaced(row) ? S.matrix.quadrants[quadrantOf(row.power, row.interest)] : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
