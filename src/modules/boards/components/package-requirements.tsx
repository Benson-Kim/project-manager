"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/form/combobox";
import { MultiSelect } from "@/components/ui/form/multi-select";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView } from "../schemas/board-view";
import type { RequirementOption } from "@/modules/requirements/schemas/requirement";
import type { BoardOptionRow } from "../schemas/board";
import { packageRequirementsInput } from "../schemas/board-package";
import { boardFormSchema } from "../schemas/board-form";
import {
  packageRequirementsAction,
  readPackagingBoardAction,
  readPackagingOptionsAction,
} from "../actions";
import { BoardForm, BoardField } from "./board-form";
const M = messages.boards;
const U = M.ui;
interface Props {
  projectId?: number;
  projects?: ProjectOption[];
  board?: BoardView;
  selectedIds?: number[];
}
export function PackageRequirementsButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {U.packageTitle}
      </Button>
      {open ? <PackagingDialog {...props} close={() => setOpen(false)} /> : null}
    </>
  );
}
function PackagingDialog({
  projectId,
  projects = [],
  board,
  selectedIds = [],
  close,
}: Props & { close: () => void }) {
  const router = useRouter();
  const [project, setProject] = useState(
    projectId ?? board?.header.ProjectId ?? projects[0]?.id ?? 0,
  );
  const [boardId, setBoardId] = useState(board?.header.BoardId ?? 0);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [selected, setSelected] = useState(selectedIds);
  const [boards, setBoards] = useState<BoardOptionRow[]>([]);
  const [columns, setColumns] = useState(board?.columns ?? []);
  const [activeSprintId, setActiveSprintId] = useState(board?.header.ActiveSprintId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(project));
  useEffect(() => {
    if (!project) return;
    let active = true;
    readPackagingOptionsAction({ projectId: project })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRequirements(result.data.requirements);
          setBoards(result.data.boards);
        } else setError(result.error.message);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(messages.errors.INTERNAL);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [project]);
  useEffect(() => {
    if (!boardId || board) return;
    let active = true;
    readPackagingBoardAction({ boardId })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setColumns(result.data.columns);
          setActiveSprintId(result.data.activeSprintId);
        } else setError(result.error.message);
      })
      .catch(() => {
        if (active) setError(messages.errors.INTERNAL);
      });
    return () => {
      active = false;
    };
  }, [boardId, board]);
  const options = requirements.map((r) => ({ id: r.id, label: `${r.ref} · ${r.text}` }));
  return (
    <BoardForm
      title={U.packageTitle}
      close={close}
      readOnly={loading || !boardId || !columns.length || Boolean(error)}
      schema={boardFormSchema(packageRequirementsInput, {
        boardId,
        boardColumnId: columns[0]?.BoardColumnId,
        boardSprintId: activeSprintId,
        requirementIds: selected,
      })}
      save={async (input) => {
        const result = await packageRequirementsAction(input);
        if (result.ok && !board) router.push(`/projects/${project}/boards/${boardId}`);
        return result;
      }}
    >
      <ErrorSummary message={error} />
      {!projectId && board?.header.ProjectId === null ? (
        <BoardField name="sourceProject" label={M.project}>
          <Combobox
            name="sourceProject"
            defaultValue={String(project)}
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
            onSelect={(option) => {
              setLoading(Boolean(option));
              setError(null);
              setProject(Number(option?.value ?? 0));
              setRequirements([]);
              setSelected([]);
            }}
          />
        </BoardField>
      ) : null}
      {!board ? (
        <BoardField name="destinationBoard" label={M.name}>
          <Combobox
            name="destinationBoard"
            defaultValue={String(boardId || "")}
            options={boards.map((b) => ({
              value: String(b.BoardId),
              label: `${b.Name} · ${b.ProjectName ?? M.noProject}`,
            }))}
            onSelect={(option) => {
              setColumns([]);
              setError(null);
              setBoardId(Number(option?.value ?? 0));
            }}
          />
        </BoardField>
      ) : null}
      <BoardField name="boardColumnId" label={U.column}>
        <Combobox
          key={columns.map((c) => c.BoardColumnId).join(",")}
          name="boardColumnId"
          defaultValue={String(columns[0]?.BoardColumnId ?? "")}
          options={columns.map((c) => ({ value: String(c.BoardColumnId), label: c.Name }))}
        />
      </BoardField>
      <BoardField name="requirementIds" label={U.requirements}>
        <MultiSelect
          options={options}
          selected={options.filter((o) => selected.includes(o.id))}
          disabled={loading}
          inputName="selectedRequirements"
          emptyPlaceholder={U.noRequirements}
          removeLabel={U.removeRequirement}
          onAdd={(option) => setSelected((ids) => [...ids, option.id])}
          onRemove={(id) => setSelected((ids) => ids.filter((item) => item !== id))}
        />
      </BoardField>
      {loading ? (
        <p>{messages.app.loading}</p>
      ) : !requirements.length ? (
        <p>{U.noRequirements}</p>
      ) : null}
    </BoardForm>
  );
}
