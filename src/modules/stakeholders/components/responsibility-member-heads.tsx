"use client";

import { BinIcon } from "@/components/ui/action-icons";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag/drag-look";
import type { DragGesture, ListDrop } from "@/components/ui/drag/use-pointer-drag";
import { messages } from "@/lib/messages";
import type { ResponsibilityMember } from "../schemas/responsibility-matrix";

const t = messages.responsibility;

/** The row of headings the people's columns are dragged along. */
export const MEMBER_LANE = "members";

/**
 * The matrix's people as column headings, in the order shown. Someone who can edit drags a heading
 * along the row to move that person's column, or uses the arrows from the keyboard; the bin takes
 * the person off the matrix.
 */
export function ResponsibilityMemberHeads({
  members,
  cellClass,
  canEdit,
  movable,
  busy,
  drag,
  onMove,
  onRemove,
}: {
  members: readonly ResponsibilityMember[];
  cellClass: (stakeholderId: number) => string;
  canEdit: boolean;
  movable: boolean;
  busy: boolean;
  drag: DragGesture<number, ListDrop>;
  onMove: (stakeholderId: number, position: number) => void;
  onRemove: (member: ResponsibilityMember) => void;
}) {
  return (
    <>
      {members.map((member, index) => (
        <th
          key={member.stakeholderId}
          scope="col"
          data-testid="responsibility-member"
          data-drag-item={member.stakeholderId}
          data-flip-cell={`head:${member.stakeholderId}`}
          className={`${cellClass(member.stakeholderId)} align-bottom text-xs text-ink-muted ${
            movable ? "cursor-grab select-none" : ""
          }`}
          {...drag.bind(member.stakeholderId)}
        >
          <div className="flex items-center gap-1 font-semibold text-ink">
            {movable ? (
              <DragHandle label={t.drag(member.name)} className="h-6 w-4 shrink-0 rounded-md" />
            ) : null}
            {member.name}
          </div>
          {canEdit ? (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="compact"
                aria-label={t.moveLeft(member.name)}
                disabled={busy || index === 0}
                onClick={() => onMove(member.stakeholderId, index - 1)}
              >
                ‹
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                aria-label={t.moveRight(member.name)}
                disabled={busy || index === members.length - 1}
                onClick={() => onMove(member.stakeholderId, index + 1)}
              >
                ›
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                aria-label={t.remove(member.name)}
                disabled={busy}
                onClick={() => onRemove(member)}
              >
                <BinIcon className="size-4 shrink-0 text-danger" />
              </Button>
            </div>
          ) : null}
        </th>
      ))}
    </>
  );
}
