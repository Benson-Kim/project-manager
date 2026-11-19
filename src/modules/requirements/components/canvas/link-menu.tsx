"use client";

import { ContextMenu } from "@/components/ui/context-menu";
import { MenuButton } from "@/components/ui/menu";
import { messages } from "@/lib/messages";

const M = messages.requirements.canvas;

/** A link's right-click menu. Drawing the link again brings it back, so removing it asks nothing. */
export function LinkMenu({
  from,
  to,
  at,
  onClose,
  onRemove,
  onStyle,
  onBranch,
}: {
  from: string;
  to: string;
  at: { x: number; y: number };
  onClose: () => void;
  onRemove: () => void;
  onStyle: () => void;
  /** Absent for a line that is itself a branch: a branch cannot start on another branch. */
  onBranch?: (fromLabel: boolean) => void;
}) {
  return (
    <ContextMenu at={at} label={M.linkMenu(from, to)} onClose={onClose}>
      <MenuButton testId="canvas-menu-style-link" onClick={onStyle}>
        {M.styleLink}
      </MenuButton>
      {onBranch ? (
        <>
          <MenuButton testId="canvas-menu-branch-here" onClick={() => onBranch(false)}>
            {M.branchHere}
          </MenuButton>
          <MenuButton testId="canvas-menu-branch-label" onClick={() => onBranch(true)}>
            {M.branchLabel}
          </MenuButton>
        </>
      ) : null}
      <MenuButton testId="canvas-menu-remove-link" onClick={onRemove}>
        {M.removeLink}
      </MenuButton>
    </ContextMenu>
  );
}
