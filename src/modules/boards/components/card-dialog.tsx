"use client";
import Link from "next/link";
import { Input, DatePicker } from "@/components/ui/form/inputs";
import { Combobox } from "@/components/ui/form/combobox";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { messages } from "@/lib/messages";
import { toDateInput } from "@/lib/format";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import type { BoardView, BoardAssigneeRow } from "../schemas/board-view";
import type { BoardCardDetailRow, BoardCardListRow } from "../schemas/board-card";
import {
  createBoardCardInput,
  updateBoardCardInput,
  moveBoardCardInput,
} from "../schemas/board-card";
import { BOARD_CARD_TITLE_MAX, STORY_POINTS_MAX } from "../schemas/board-rules";
import { boardFormSchema } from "../schemas/board-form";
import { createBoardCardAction, updateBoardCardAction, moveBoardCardAction } from "../actions";
import { BoardForm, BoardField } from "./board-form";
const M = messages.boards;
const U = M.ui;
export function CardDialog({
  board,
  card,
  columnId,
  assignees,
  canEdit,
  close,
}: {
  board: BoardView;
  card: BoardCardDetailRow | null;
  columnId: number | null;
  assignees: BoardAssigneeRow[];
  canEdit: boolean;
  close: () => void;
}) {
  return (
    <BoardForm
      sheet
      title={card ? U.editCard : U.newCard}
      close={close}
      readOnly={Boolean(card) && !canEdit}
      schema={boardFormSchema(
        card ? updateBoardCardInput : createBoardCardInput,
        card
          ? { boardCardId: card.BoardCardId, rowVer: card.RowVer }
          : {
              boardId: board.header.BoardId,
              boardColumnId: columnId,
              boardSprintId: board.header.ActiveSprintId,
            },
      )}
      save={(input) =>
        "boardCardId" in input ? updateBoardCardAction(input) : createBoardCardAction(input)
      }
    >
      {card?.RequirementState === "live" ? (
        <Link
          className="text-accent underline"
          href={`/projects/${card.RequirementProjectId}/requirements?id=${card.RequirementId}`}
        >
          {card.RequirementRef}
        </Link>
      ) : null}
      <BoardField name="title" label={U.cardTitle}>
        <Input
          name="title"
          defaultValue={card?.Title ?? ""}
          maxLength={BOARD_CARD_TITLE_MAX}
          autoFocus
        />
      </BoardField>
      <BoardField name="notes" label={U.notes}>
        <RichTextEditor name="notes" label={U.notes} defaultValue={card?.Notes} />
      </BoardField>
      <BoardField name="assigneeUserId" label={U.assignee}>
        <Combobox
          name="assigneeUserId"
          defaultValue={String(card?.AssigneeUserId ?? "")}
          options={[
            { value: "", label: U.unassigned },
            ...assignees.map((a) => ({ value: String(a.UserId), label: a.DisplayName })),
          ]}
        />
      </BoardField>
      <BoardField name="dueDate" label={U.due}>
        <DatePicker name="dueDate" defaultValue={toDateInput(card?.DueDate)} />
      </BoardField>
      <BoardField name="storyPoints" label={U.points}>
        <Input
          name="storyPoints"
          type="number"
          min={0}
          max={STORY_POINTS_MAX}
          defaultValue={card?.StoryPoints ?? ""}
        />
      </BoardField>
      <BoardField name="color" label={U.color}>
        <Combobox
          name="color"
          defaultValue={card?.Color ?? ""}
          options={[
            { value: "", label: U.noColor },
            ...OPTION_COLORS.map((color) => ({
              value: color,
              label: messages.lookupLists.colors[color],
            })),
          ]}
        />
      </BoardField>
    </BoardForm>
  );
}
export function CardMoveDialog({
  board,
  card,
  close,
}: {
  board: BoardView;
  card: BoardCardListRow;
  close: () => void;
}) {
  return (
    <BoardForm
      title={U.move}
      close={close}
      submitLabel={U.move}
      schema={boardFormSchema(moveBoardCardInput, {
        boardCardId: card.BoardCardId,
        rowVer: card.RowVer,
        sprintSet: true,
      })}
      save={moveBoardCardAction}
    >
      <BoardField name="toColumnId" label={U.column}>
        <Combobox
          name="toColumnId"
          defaultValue={String(card.BoardColumnId)}
          options={board.columns.map((c) => ({ value: String(c.BoardColumnId), label: c.Name }))}
        />
      </BoardField>
      <BoardField name="toSprintId" label={U.sprint}>
        <Combobox
          name="toSprintId"
          defaultValue={String(card.BoardSprintId ?? "")}
          options={[
            { value: "", label: M.backlog },
            ...board.sprints
              .filter((s) => s.State !== "completed")
              .map((s) => ({ value: String(s.BoardSprintId), label: s.Name })),
          ]}
        />
      </BoardField>
    </BoardForm>
  );
}
