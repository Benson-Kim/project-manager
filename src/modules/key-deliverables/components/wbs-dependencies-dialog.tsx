"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { descendantIds, type Wbs } from "../schemas/wbs";
import {
  DEPENDENCY_TYPES,
  LAG_MAX_DAYS,
  LAG_MIN_DAYS,
  linkRefusal,
  linksOf,
  type DependencyType,
  type LinkRefusal,
  type WbsLink,
} from "../schemas/wbs-dependencies";

const W = messages.keyDeliverables.wbs;

function itemLabel(wbs: Wbs, id: number): string {
  const node = wbs.nodes.get(id);
  if (!node) return messages.keyDeliverables.deliverableFallback(id);
  return `${node.code} ${node.item.name || messages.keyDeliverables.deliverableFallback(id)}`;
}

const REFUSALS: Record<LinkRefusal, string> = {
  self: W.linkSelf,
  duplicate: W.linkDuplicate,
  related: W.linkRelated,
  cycle: W.linkCycle,
};

/**
 * "Dependencies…" (ADR-0046 decision 9): the keyboard way to sequence two items, where dragging
 * from a bar's edge is pointer-only — the same treatment ADR-0027 section 8 gave drag-and-drop
 * (WCAG 2.5.7). It lists what the item waits for and what follows it, adds a link, and removes one.
 *
 * Every item in the project is offered; the four rules the proc enforces under the project lock are
 * mirrored here so the reason is shown before the link is attempted, not after it is refused.
 */
export function WbsDependenciesDialog({
  wbs,
  links,
  id,
  canEdit,
  onClose,
  onLink,
  onUnlink,
}: {
  wbs: Wbs;
  links: readonly WbsLink[];
  id: number;
  canEdit: boolean;
  onClose: () => void;
  onLink: (predecessorId: number, type: DependencyType, lagDays: number) => void;
  onUnlink: (link: WbsLink) => void;
}) {
  const { predecessors, successors } = linksOf(links, id);

  const branch = new Set([id, ...descendantIds(wbs, id)]);
  const candidates = wbs.order
    .filter((other) => !branch.has(other) && linkRefusal(wbs, links, other, id) === null)
    .map((other) => ({ value: String(other), label: itemLabel(wbs, other) }));

  const [predecessorId, setPredecessorId] = useState<number | null>(null);
  const [type, setType] = useState<DependencyType>("FS");
  const [lag, setLag] = useState(0);
  const refusal = predecessorId === null ? null : linkRefusal(wbs, links, predecessorId, id);

  function row(link: WbsLink, otherId: number) {
    return (
      <li key={link.id} className="flex items-center gap-2 py-1 text-sm text-ink">
        <span className="min-w-0 flex-1 truncate">
          {W.linkSummary(
            wbs.nodes.get(otherId)?.code ?? "",
            wbs.nodes.get(otherId)?.item.name ||
              messages.keyDeliverables.deliverableFallback(otherId),
            W.dependencyTypes[link.type],
            link.lagDays,
          )}
        </span>
        {canEdit && link.successorId === id ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onUnlink(link)}
            aria-label={W.unlinkLabel(wbs.nodes.get(otherId)?.code ?? "")}
          >
            {W.unlink}
          </Button>
        ) : null}
      </li>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={W.dependenciesOf(itemLabel(wbs, id))}
    >
      <div className="flex flex-col gap-4" data-testid="wbs-dependencies">
        <section>
          <h3 className="text-xs font-medium text-ink-muted">{W.predecessorsLabel}</h3>
          {predecessors.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">{W.noDependencies}</p>
          ) : (
            <ul role="list" className="m-0 list-none p-0">
              {predecessors.map((link) => row(link, link.predecessorId))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-xs font-medium text-ink-muted">{W.successorsLabel}</h3>
          {successors.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">{W.noDependencies}</p>
          ) : (
            <ul role="list" className="m-0 list-none p-0">
              {successors.map((link) => row(link, link.successorId))}
            </ul>
          )}
        </section>

        {canEdit && candidates.length > 0 ? (
          <form
            className="flex flex-col gap-3 border-t border-line pt-4"
            data-testid="wbs-dependency-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (predecessorId === null || refusal !== null) return;
              onLink(predecessorId, type, lag);
              setPredecessorId(null);
            }}
          >
            <Field
              label={W.dependencyPredecessor}
              name="predecessor"
              errors={refusal ? [REFUSALS[refusal]] : undefined}
            >
              <Combobox
                name="predecessor"
                options={candidates}
                onSelect={(option) => setPredecessorId(option ? Number(option.value) : null)}
              />
            </Field>
            <div className="flex gap-3">
              <Field label={W.dependencyType} name="type">
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value as DependencyType)}
                >
                  {DEPENDENCY_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {W.dependencyTypes[option]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={W.dependencyLag} name="lag">
                <Input
                  type="number"
                  value={lag}
                  min={LAG_MIN_DAYS}
                  max={LAG_MAX_DAYS}
                  onChange={(event) => setLag(Number(event.target.value) || 0)}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {messages.actions.cancel}
              </Button>
              <Button
                type="submit"
                disabled={predecessorId === null || refusal !== null}
                data-testid="wbs-dependency-submit"
              >
                {W.link}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Dialog>
  );
}
