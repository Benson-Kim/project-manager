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
}: {
  from: string;
  to: string;
  at: { x: number; y: number };
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <ContextMenu at={at} label={M.linkMenu(from, to)} onClose={onClose}>
      <MenuButton testId="canvas-menu-remove-link" onClick={onRemove}>
        {M.removeLink}
      </MenuButton>
    </ContextMenu>
  );
}
