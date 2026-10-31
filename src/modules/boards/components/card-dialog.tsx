"use client";
import { useMemo, useState } from "react";
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
import { packageDeliverablesInput } from "../schemas/board-package";
import {
  createBoardCardAction,
  updateBoardCardAction,
  moveBoardCardAction,
  packageDeliverablesAction,
} from "../actions";
import type { ProjectOption } from "@/modules/projects/project-options";
import { BoardForm, BoardField } from "./board-form";
import { CardDeliverablePanel } from "./card-deliverable-panel";
import { CardRequirementPanel } from "./card-requirement-panel";
import { CardSourceSwitch, DeliverablePicker, type CardSource } from "./deliverable-source";
const M = messages.boards;
const U = M.ui;
export function CardDialog({
  board,
  card,
  columnId,
  assignees,
  projects,
  canEdit,
  canEditRequirements = false,
  onCardChange,
  onChanged,
  close,
}: {
  board: BoardView;
  card: BoardCardDetailRow | null;
  columnId: number | null;
  assignees: BoardAssigneeRow[];
  projects: ProjectOption[];
  canEdit: boolean;
  canEditRequirements?: boolean;
  /** A section of the sheet wrote and read the card again: the sheet now edits this version. */
  onCardChange: (card: BoardCardDetailRow) => void;
  /** Something the board draws changed; it redraws once the sheet closes. */
  onChanged: () => void;
  close: () => void;
}) {
  const [source, setSource] = useState<CardSource>("card");
  const [deliverables, setDeliverables] = useState<number[]>([]);
  const takenIds = useMemo(
    () => board.cards.flatMap((c) => (c.RequirementId === null ? [] : [c.RequirementId])),
    [board.cards],
  );
  if (!card && source === "deliverable")
    return (
      <BoardForm
        sheet
        title={U.newCard}
        close={close}
        submitDisabled={!deliverables.length}
        schema={boardFormSchema(packageDeliverablesInput, {
          boardId: board.header.BoardId,
          boardColumnId: columnId,
          boardSprintId: board.header.ActiveSprintId,
          keyDeliverableIds: deliverables,
        })}
        save={packageDeliverablesAction}
      >
        <CardSourceSwitch value={source} onChange={setSource} />
        <DeliverablePicker
          boardProjectId={board.header.ProjectId}
          projects={projects}
          selected={deliverables}
          onSelect={setDeliverables}
        />
      </BoardForm>
    );
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
      {!card ? <CardSourceSwitch value={source} onChange={setSource} /> : null}
      {card ? (
        <CardRequirementPanel
          card={card}
          boardProjectId={board.header.ProjectId}
          projects={projects}
          takenIds={takenIds}
          canLink={canEdit}
          canEditRequirement={canEditRequirements}
          onCardChange={(fresh) => {
            onChanged();
            onCardChange(fresh);
          }}
        />
      ) : null}
      {card ? (
        <CardDeliverablePanel card={card} canEdit={canEditRequirements} onChanged={onChanged} />
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
  onMoved,
}: {
  board: BoardView;
  card: BoardCardListRow;
  close: () => void;
  onMoved: () => void;
}) {
  return (
    <BoardForm
      title={U.move}
      close={close}
      onSaved={onMoved}
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
