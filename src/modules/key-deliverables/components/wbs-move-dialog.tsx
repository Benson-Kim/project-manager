"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { descendantIds, fitsUnder, type Placement, type Wbs } from "../schemas/wbs";

const W = messages.keyDeliverables.wbs;

/** The Combobox value for the project itself: the item becomes a top-level item. */
const TOP = "top";

function itemLabel(wbs: Wbs, id: number): string {
  const node = wbs.nodes.get(id)!;
  return `${node.code} ${node.item.name || messages.keyDeliverables.deliverableFallback(id)}`;
}

/**
 * "Move to…" (ADR-0027 §8): sends the selected item, with its branch, under
 * any other item or to the top level, at the place picked among its new
 * siblings. The keyboard way to move an item far, where dragging would cross
 * the chart. Items in its own branch, and parents it would pass ten levels
 * under, are not offered.
 */
export function WbsMoveDialog({
  wbs,
  id,
  projectName,
  onClose,
  onMove,
}: {
  wbs: Wbs;
  id: number;
  projectName: string;
  onClose: () => void;
  onMove: (placement: Placement) => void;
}) {
  const node = wbs.nodes.get(id)!;
  const branch = new Set([id, ...descendantIds(wbs, id)]);
  const parents = [
    { value: TOP, label: W.topLevel(projectName) },
    ...wbs.order
      .filter((other) => !branch.has(other) && fitsUnder(wbs, id, other))
      .map((other) => ({ value: String(other), label: itemLabel(wbs, other) })),
  ];

  const [parentId, setParentId] = useState<number | null>(node.parentId);
  const siblingsUnder = (parent: number | null) =>
    (parent === null ? wbs.rootIds : wbs.nodes.get(parent)!.childIds).filter((s) => s !== id);
  const siblings = siblingsUnder(parentId);
  const [position, setPosition] = useState(node.index + 1);
  const unchanged = parentId === node.parentId && position === node.index + 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={W.moveTitle(
        node.code,
        node.item.name || messages.keyDeliverables.deliverableFallback(id),
      )}
    >
      <form
        className="flex flex-col gap-4"
        data-testid="wbs-move-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (unchanged) return;
          onMove({ parentId, position });
          onClose();
        }}
      >
        <Field label={W.moveUnder} name="parent">
          <Combobox
            name="parent"
            options={parents}
            defaultValue={parentId === null ? TOP : String(parentId)}
            onSelect={(option) => {
              if (!option) return;
              const next = option.value === TOP ? null : Number(option.value);
              setParentId(next);
              // A new parent takes the item last; its own parent keeps its place.
              setPosition(next === node.parentId ? node.index + 1 : siblingsUnder(next).length + 1);
            }}
          />
        </Field>
        <Field label={W.movePosition} name="position">
          <Select value={position} onChange={(event) => setPosition(Number(event.target.value))}>
            <option value={1}>{W.first}</option>
            {siblings.map((sibling, i) => (
              <option key={sibling} value={i + 2}>
                {W.after(itemLabel(wbs, sibling))}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {messages.actions.cancel}
          </Button>
          <Button type="submit" disabled={unchanged} data-testid="wbs-move-submit">
            {W.move}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
