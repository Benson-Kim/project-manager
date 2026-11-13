"use client";

import { BinIcon } from "@/components/ui/action-icons";
import { ContextMenu } from "@/components/ui/context-menu";
import { MenuButton, MenuSeparator } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { FLOW_KINDS, type BpmnDiagram, type FlowKind } from "../model/diagram";
import type { Point } from "../model/edit";
import type { PaletteItem } from "./palette";

const M = messages.bpmn;
const C = M.menu;

/** What was right-clicked, where the menu opens on screen, and for the board where that is drawn. */
export type MenuTarget =
  | { of: "shape" | "pool" | "flow"; id: string; screen: Point }
  | { of: "canvas"; screen: Point; at: Point };

/** The symbols a right-click on the empty board can add, the commonest of each group. */
const QUICK_ADD: readonly PaletteItem[] = [
  "startEvent",
  "task",
  "userTask",
  "exclusiveGateway",
  "endEvent",
  "pool",
];

/** The board's own keys for the same actions, shown beside them. */
const RENAME_KEY = { label: "F2", keys: "F2" };
const DELETE_KEY = { label: "Del", keys: "Delete" };

export interface BoardMenuActions {
  rename: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  addLane: (poolId: string) => void;
  setFlowKind: (id: string, kind: FlowKind) => void;
  place: (item: PaletteItem, at: Point) => void;
}

function nameOf(diagram: BpmnDiagram, target: MenuTarget): string | null {
  if (target.of === "canvas") return C.canvas;
  if (target.of === "pool") return diagram.pools.find((p) => p.id === target.id)?.name ?? null;
  if (target.of === "flow") {
    const flow = diagram.flows.find((f) => f.id === target.id);
    return flow ? flow.label.trim() || M.flows[flow.kind] : null;
  }
  const shape = diagram.shapes.find((s) => s.id === target.id);
  return shape ? shape.label.trim() || M.shapes[shape.kind] : null;
}

/** The board's right-click menu: what can be done to the thing under the pointer. */
export function BoardMenu({
  diagram,
  target,
  actions,
  onClose,
}: {
  diagram: BpmnDiagram;
  target: MenuTarget;
  actions: BoardMenuActions;
  onClose: () => void;
}) {
  const name = nameOf(diagram, target);
  if (name === null) return null;
  const item = (
    testId: string,
    label: string,
    run: () => void,
    more: Omit<React.ComponentProps<typeof MenuButton>, "children" | "onClick" | "testId"> = {},
  ) => (
    <MenuButton key={testId} testId={`bpmn-menu-${testId}`} onClick={run} {...more}>
      {label}
    </MenuButton>
  );
  const body = (() => {
    if (target.of === "canvas")
      return QUICK_ADD.map((each) =>
        item(`add-${each}`, C.add(each === "pool" ? M.pool : M.shapes[each]), () =>
          actions.place(each, target.at),
        ),
      );
    const { id } = target;
    const rename = (label: string) =>
      item("rename", label, () => actions.rename(id), { shortcut: RENAME_KEY });
    const remove = [
      <MenuSeparator key="before-delete" />,
      item("delete", C.delete, () => actions.remove(id), {
        tone: "danger",
        icon: <BinIcon />,
        shortcut: DELETE_KEY,
      }),
    ];
    if (target.of === "pool")
      return [rename(C.rename), item("add-lane", C.addLane, () => actions.addLane(id)), ...remove];
    if (target.of === "flow") {
      const kind = diagram.flows.find((f) => f.id === id)?.kind;
      return [
        rename(C.editText),
        <MenuSeparator key="kinds" />,
        ...FLOW_KINDS.map((each) =>
          item(`flow-${each}`, M.flows[each], () => actions.setFlowKind(id, each), {
            checked: each === kind,
          }),
        ),
        ...remove,
      ];
    }
    return [
      rename(C.rename),
      item("duplicate", C.duplicate, () => actions.duplicate(id)),
      ...remove,
    ];
  })();
  return (
    <ContextMenu at={target.screen} label={C.label(name)} onClose={onClose}>
      {body}
    </ContextMenu>
  );
}
