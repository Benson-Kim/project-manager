"use client";
import { useRouter } from "next/navigation";
import { Input, Textarea, Switch } from "@/components/ui/form/inputs";
import { Combobox } from "@/components/ui/form/combobox";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView } from "../schemas/board-view";
import { updateBoardInput, setBoardProjectInput, deleteBoardInput } from "../schemas/board";
import { BOARD_NAME_MAX, BOARD_DESCRIPTION_MAX } from "../schemas/board-rules";
import { boardFormSchema } from "../schemas/board-form";
import { updateBoardAction, setBoardProjectAction, deleteBoardAction } from "../actions";
import { BoardForm, BoardField } from "./board-form";
import { BoardConfirm } from "./board-confirm";
const M = messages.boards;
export function BoardDetailsDialog({
  board,
  projects,
  mode,
  close,
}: {
  board: BoardView;
  projects: ProjectOption[];
  mode: "board" | "link" | "delete-board";
  close: () => void;
}) {
  const router = useRouter();
  const identity = { boardId: board.header.BoardId, rowVer: board.header.RowVer };
  if (mode === "delete-board")
    return (
      <BoardConfirm
        title={M.deleteTitle}
        body={M.deleteBody}
        schema={deleteBoardInput}
        input={identity}
        save={async (input) => {
          const result = await deleteBoardAction(input);
          if (result.ok)
            router.push(
              board.header.ProjectId ? `/projects/${board.header.ProjectId}/boards` : "/boards",
            );
          return result;
        }}
        close={close}
      />
    );
  if (mode === "link")
    return (
      <BoardForm
        title={M.ui.link}
        schema={boardFormSchema(setBoardProjectInput, { ...identity, removeForeignCards: false })}
        save={setBoardProjectAction}
        onSaved={(updated) =>
          router.push(
            updated.ProjectId
              ? `/projects/${updated.ProjectId}/boards/${updated.BoardId}`
              : `/boards/${updated.BoardId}`,
          )
        }
        close={close}
      >
        <BoardField name="projectId" label={M.project}>
          <Combobox
            name="projectId"
            defaultValue={String(board.header.ProjectId ?? "")}
            options={[
              { value: "", label: M.noProject },
              ...projects.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
          />
        </BoardField>
        <Switch name="removeForeignCards" label={M.ui.removeForeign} />
      </BoardForm>
    );
  return (
    <BoardForm
      title={M.ui.settings}
      schema={boardFormSchema(updateBoardInput, identity)}
      save={updateBoardAction}
      close={close}
    >
      <BoardField name="name" label={M.name}>
        <Input name="name" defaultValue={board.header.Name} maxLength={BOARD_NAME_MAX} autoFocus />
      </BoardField>
      <BoardField name="description" label={M.description}>
        <Textarea
          name="description"
          defaultValue={board.header.Description ?? ""}
          maxLength={BOARD_DESCRIPTION_MAX}
        />
      </BoardField>
    </BoardForm>
  );
}
