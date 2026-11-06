"use client";

import { ContextMenu } from "@/components/ui/context-menu";
import { MenuButton } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import type { CanvasItem } from "../../schemas/canvas";

const M = messages.requirements.canvas;

/**
 * A card's right-click menu. A requirement opens in the inspector and any card can be focused by
 * anyone who can see it; the link and remove items need edit rights. A WBS item can only be an
 * upstream end.
 */
export function NodeMenu({
  item,
  at,
  canEdit,
  onClose,
  onInspect,
  onStartLink,
  onFocus,
  onHide,
}: {
  item: CanvasItem;
  at: { x: number; y: number };
  canEdit: boolean;
  onClose: () => void;
  onInspect: (requirementId: number) => void;
  onStartLink: (fromDownstream: boolean) => void;
  onFocus: () => void;
  onHide: (item: CanvasItem) => void;
}) {
  const isRequirement = item.Kind === "Requirement";
  return (
    <ContextMenu at={at} label={M.menu(item.Ref)} onClose={onClose}>
      {isRequirement ? (
        <MenuButton testId="canvas-menu-inspect" onClick={() => onInspect(item.ItemId)}>
          {M.inspect}
        </MenuButton>
      ) : null}
      <MenuButton testId="canvas-menu-focus" onClick={onFocus}>
        {M.focus}
      </MenuButton>
      {canEdit ? (
        <>
          <MenuButton testId="canvas-menu-link-downstream" onClick={() => onStartLink(true)}>
            {M.linkDownstream}
          </MenuButton>
          {isRequirement ? (
            <MenuButton testId="canvas-menu-link-upstream" onClick={() => onStartLink(false)}>
              {M.linkUpstream}
            </MenuButton>
          ) : null}
          <MenuButton testId="canvas-menu-hide" onClick={() => onHide(item)}>
            {M.removeFromCanvas}
          </MenuButton>
        </>
      ) : null}
    </ContextMenu>
  );
}
