"use client";
import { Input, DatePicker } from "@/components/ui/form/inputs";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { BoardView } from "../schemas/board-view";
import {
  createBoardPhaseInput,
  updateBoardPhaseInput,
  deleteBoardPhaseInput,
} from "../schemas/board-phase";
import { BOARD_PHASE_NAME_MAX } from "../schemas/board-rules";
import { boardFormSchema } from "../schemas/board-form";
import { createBoardPhaseAction, updateBoardPhaseAction, deleteBoardPhaseAction } from "../actions";
import { BoardForm, BoardField } from "./board-form";
import { BoardConfirm } from "./board-confirm";
const M = messages.boards;
export function PhaseDialog({
  board,
  id,
  deleting = false,
  close,
}: {
  board: BoardView;
  id?: number;
  deleting?: boolean;
  close: () => void;
}) {
  const phase = board.phases.find((p) => p.BoardPhaseId === id);
  if (id && !phase) return null;
  if (deleting && phase)
    return (
      <BoardConfirm
        title={M.deletePhaseTitle}
        body={M.deletePhaseBody(board.sprints.filter((s) => s.BoardPhaseId === id).length)}
        schema={deleteBoardPhaseInput}
        input={{ boardPhaseId: phase.BoardPhaseId, rowVer: phase.RowVer }}
        save={deleteBoardPhaseAction}
        close={close}
      />
    );
  return (
    <BoardForm
      title={phase ? M.ui.editPhase : M.newPhase}
      close={close}
      schema={boardFormSchema(
        phase ? updateBoardPhaseInput : createBoardPhaseInput,
        phase
          ? { boardPhaseId: phase.BoardPhaseId, rowVer: phase.RowVer }
          : { boardId: board.header.BoardId },
      )}
      save={(input) =>
        "boardPhaseId" in input ? updateBoardPhaseAction(input) : createBoardPhaseAction(input)
      }
    >
      <BoardField name="name" label={M.phaseName}>
        <Input name="name" defaultValue={phase?.Name} maxLength={BOARD_PHASE_NAME_MAX} autoFocus />
      </BoardField>
      <BoardField name="startDate" label={M.ui.start}>
        <DatePicker name="startDate" defaultValue={toDateInput(phase?.StartDate)} />
      </BoardField>
      <BoardField name="endDate" label={M.ui.end}>
        <DatePicker name="endDate" defaultValue={toDateInput(phase?.EndDate)} />
      </BoardField>
    </BoardForm>
  );
}
