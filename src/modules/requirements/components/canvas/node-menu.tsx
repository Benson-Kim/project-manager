"use client";

import { ContextMenu } from "@/components/ui/context-menu";
import { MenuButton, MenuSeparator } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { useCrossLinkMenu } from "@/modules/cross-links/components/context-menu-bridge";
import { isSameEndpoint } from "@/modules/cross-links/schemas/location";
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
  onShowAll,
  onHide,
}: {
  item: CanvasItem;
  at: { x: number; y: number };
  canEdit: boolean;
  onClose: () => void;
  onInspect: (requirementId: number) => void;
  onStartLink: (fromDownstream: boolean) => void;
  onFocus: () => void;
  onShowAll?: () => void;
  onHide: (item: CanvasItem) => void;
}) {
  const cl = useCrossLinkMenu();
  const isRequirement = item.Kind === "Requirement";
  const clEndpoint =
    cl && cl.location
      ? {
          ...cl.location,
          subEntityId: isRequirement ? item.ItemId : null,
          anchorKind: "subrecord" as const,
          anchorKey: `${isRequirement ? "requirement" : "wbs"}:${item.ItemId}`,
          label: item.Ref.slice(0, 120),
        }
      : null;
  const canCompleteLink =
    Boolean(clEndpoint && cl?.pendingSource) &&
    Boolean(clEndpoint && cl?.pendingSource && !isSameEndpoint(cl.pendingSource, clEndpoint));

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
      {onShowAll ? (
        <MenuButton testId="canvas-menu-show-all-links" onClick={onShowAll}>
          {M.showAllLinks}
        </MenuButton>
      ) : null}
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
      {cl && clEndpoint ? (
        <>
          <MenuSeparator />
          <MenuButton
            testId="canvas-menu-cl-add-link"
            onClick={() => {
              onClose();
              cl.startCrossLink(clEndpoint);
            }}
          >
            {messages.crossLinks.addCrossLinkMenu}
          </MenuButton>
          {canCompleteLink && cl.pendingSource ? (
            <MenuButton
              testId="canvas-menu-cl-complete-link"
              onClick={() => {
                onClose();
                cl.completeCrossLink(clEndpoint);
              }}
            >
              {messages.crossLinks.completeCrossLinkWithMenu(cl.pendingSource.label.slice(0, 40))}
            </MenuButton>
          ) : null}
          <MenuButton
            testId="canvas-menu-cl-add-note"
            onClick={() => {
              onClose();
              cl.openAddPageNote(clEndpoint);
            }}
          >
            {messages.crossLinks.addPageNoteMenu}
          </MenuButton>
        </>
      ) : null}
    </ContextMenu>
  );
}
