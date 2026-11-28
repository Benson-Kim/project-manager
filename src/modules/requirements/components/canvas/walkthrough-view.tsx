"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { messages } from "@/lib/messages";
import { itemKey } from "../../canvas/gaps";
import {
  LANES_BY,
  walkthroughLanes,
  type LanesBy,
  type WalkthroughLane,
} from "../../canvas/walkthrough";
import type { CanvasItem, CanvasLink } from "../../schemas/canvas";
import { typeLabel, type RequirementType } from "../../schemas/requirement-types";

const M = messages.requirements.canvas.walkthrough;
const BY_LABEL: Record<LanesBy, string> = { type: M.byType, owner: M.byOwner };

function laneHeading(lane: WalkthroughLane, by: LanesBy): string {
  if (by === "owner") return lane.label ?? M.noOwner;
  return lane.label === "WBS" ? "WBS" : typeLabel(lane.label as RequirementType);
}

export function WalkthroughView({
  items,
  links,
  onClose,
}: {
  items: readonly CanvasItem[];
  links: readonly CanvasLink[];
  onClose: () => void;
}) {
  const [by, setBy] = useState<LanesBy>("type");
  const lanes = useMemo(
    () => walkthroughLanes(items, links, by, (item) => item.OwnerName ?? null),
    [items, links, by],
  );
  const columns = Math.max(0, ...lanes.flatMap((lane) => lane.cards.map((card) => card.step))) + 1;

  return (
    <section
      data-testid="requirement-walkthrough"
      data-lanes-by={by}
      aria-label={M.heading}
      className="flex flex-col gap-2 border-t border-line bg-surface p-3 print:border-0 print:p-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{M.heading}</h2>
        <div
          role="radiogroup"
          aria-label={M.lanesBy}
          className="ml-auto inline-flex overflow-hidden rounded-md border border-line print:hidden"
        >
          {LANES_BY.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={by === option}
              data-testid={`walkthrough-by-${option}`}
              onClick={() => setBy(option)}
              className={`min-h-10 px-3 text-sm ${by === option ? "bg-primary text-on-primary" : "hover:bg-surface-sunken"}`}
            >
              {BY_LABEL[option]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 print:hidden">
          <PrintButton
            label={M.print}
            testId="walkthrough-print"
            variant="secondary"
            className="min-h-10"
          />
          <Button
            type="button"
            variant="secondary"
            data-testid="walkthrough-close"
            onClick={onClose}
          >
            {M.close}
          </Button>
        </div>
      </div>
      {lanes.length === 0 ? (
        <p className="text-sm text-ink-muted">{M.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `8rem repeat(${columns}, minmax(10rem, 1fr))` }}
          >
            {lanes.map((lane) => (
              <section
                key={lane.key}
                data-testid="requirement-lane"
                data-lane={lane.key}
                aria-label={laneHeading(lane, by)}
                className="col-span-full grid grid-cols-subgrid items-start gap-y-2 rounded-md border border-line p-2 break-inside-avoid"
              >
                <h3 className="text-sm font-semibold" style={{ gridColumn: 1, gridRow: 1 }}>
                  {laneHeading(lane, by)}
                </h3>
                {lane.cards.map(({ item, step }) => (
                  <div
                    key={itemKey(item.Kind, item.ItemId)}
                    data-testid="walkthrough-card"
                    data-item={itemKey(item.Kind, item.ItemId)}
                    data-step={step}
                    style={{ gridColumn: step + 2 }}
                    className="rounded-md border border-line bg-surface p-2 text-sm"
                  >
                    <span className="block font-semibold">{item.Ref}</span>
                    <span className="line-clamp-3">{item.Title}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
