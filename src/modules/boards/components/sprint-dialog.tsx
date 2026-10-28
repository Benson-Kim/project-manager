"use client";
import { useState } from "react";
import { Input, Textarea, DatePicker } from "@/components/ui/form/inputs";
import { Combobox } from "@/components/ui/form/combobox";
import { Field } from "@/components/ui/form/field";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { BoardView } from "../schemas/board-view";
import {
  createBoardSprintInput,
  updateBoardSprintInput,
  deleteBoardSprintInput,
  completeBoardSprintInput,
} from "../schemas/board-sprint";
import { BOARD_SPRINT_NAME_MAX, BOARD_SPRINT_GOAL_MAX } from "../schemas/board-rules";
import { boardFormSchema } from "../schemas/board-form";
import {
  createBoardSprintAction,
  updateBoardSprintAction,
  deleteBoardSprintAction,
  completeBoardSprintAction,
} from "../actions";
import { BoardForm, BoardField } from "./board-form";
import { BoardConfirm } from "./board-confirm";
const M = messages.boards;
export function SprintDialog({
  board,
  id,
  mode,
  close,
}: {
  board: BoardView;
  id?: number;
  mode: "sprint" | "delete-sprint" | "complete";
  close: () => void;
}) {
  const sprint = board.sprints.find((s) => s.BoardSprintId === id);
  const [target, setTarget] = useState<number | null>(null);
  if (id && !sprint) return null;
  if (sprint && mode === "delete-sprint")
    return (
      <BoardConfirm
        title={M.deleteSprintTitle}
        body={M.deleteSprintBody(sprint.CardCount)}
        schema={deleteBoardSprintInput}
        input={{ boardSprintId: sprint.BoardSprintId, rowVer: sprint.RowVer }}
        save={deleteBoardSprintAction}
        close={close}
      />
    );
  if (sprint && mode === "complete")
    return (
      <BoardConfirm
        title={M.completeSprintTitle}
        body={M.ui.completeBody}
        confirmLabel={M.completeSprint}
        schema={completeBoardSprintInput}
        input={{
          boardSprintId: sprint.BoardSprintId,
          rowVer: sprint.RowVer,
          unfinishedToSprintId: target,
        }}
        save={completeBoardSprintAction}
        close={close}
      >
        <Field name="unfinishedToSprintId" label={M.ui.target}>
          <Combobox
            name="unfinishedToSprintId"
            defaultValue=""
            options={[
              { value: "", label: M.backlog },
              ...board.sprints
                .filter((s) => s.State === "planned")
                .map((s) => ({ value: String(s.BoardSprintId), label: s.Name })),
            ]}
            onSelect={(option) => setTarget(option?.value ? Number(option.value) : null)}
          />
        </Field>
      </BoardConfirm>
    );
  return (
    <BoardForm
      title={sprint ? M.ui.editSprint : M.newSprint}
      close={close}
      schema={boardFormSchema(
        sprint ? updateBoardSprintInput : createBoardSprintInput,
        sprint
          ? { boardSprintId: sprint.BoardSprintId, rowVer: sprint.RowVer }
          : { boardId: board.header.BoardId },
      )}
      save={(input) =>
        "boardSprintId" in input ? updateBoardSprintAction(input) : createBoardSprintAction(input)
      }
    >
      <BoardField name="name" label={M.sprintName}>
        <Input
          name="name"
          defaultValue={sprint?.Name}
          maxLength={BOARD_SPRINT_NAME_MAX}
          autoFocus
        />
      </BoardField>
      <BoardField name="startDate" label={M.ui.start}>
        <DatePicker name="startDate" defaultValue={toDateInput(sprint?.StartDate)} required />
      </BoardField>
      <BoardField name="endDate" label={M.ui.end}>
        <DatePicker name="endDate" defaultValue={toDateInput(sprint?.EndDate)} required />
      </BoardField>
      <BoardField name="goal" label={M.sprintGoal}>
        <Textarea name="goal" defaultValue={sprint?.Goal ?? ""} maxLength={BOARD_SPRINT_GOAL_MAX} />
      </BoardField>
      <BoardField name="boardPhaseId" label={M.sprintPhase}>
        <Combobox
          name="boardPhaseId"
          defaultValue={String(sprint?.BoardPhaseId ?? "")}
          options={[
            { value: "", label: M.noPhase },
            ...board.phases.map((p) => ({ value: String(p.BoardPhaseId), label: p.Name })),
          ]}
        />
      </BoardField>
    </BoardForm>
  );
}
