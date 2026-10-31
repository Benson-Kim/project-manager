"use client";
import { useEffect, useState } from "react";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { MultiSelect } from "@/components/ui/form/multi-select";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import { readDeliverableOptionsAction } from "../actions";
import { BoardField } from "./board-form";

const M = messages.boards;
const S = M.source;

export type CardSource = "card" | "deliverable";

/** The new-card sheet's first choice: a free card, or cards that carry deliverables. */
export function CardSourceSwitch({
  value,
  onChange,
}: {
  value: CardSource;
  onChange: (source: CardSource) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="mb-1 text-sm font-medium">{S.label}</legend>
      {(["card", "deliverable"] as const).map((source) => (
        <label key={source} className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="radio"
            name="cardSource"
            value={source}
            checked={value === source}
            onChange={() => onChange(source)}
          />
          {S[source]}
        </label>
      ))}
    </fieldset>
  );
}

interface Option {
  id: number;
  label: string;
}

/**
 * Picks the deliverables to add as cards. A project board offers its own project's breakdown;
 * a standalone board first asks which project, as Add to board does.
 */
export function DeliverablePicker({
  boardProjectId,
  projects,
  selected,
  onSelect,
}: {
  boardProjectId: number | null;
  projects: ProjectOption[];
  selected: number[];
  onSelect: (ids: number[]) => void;
}) {
  const [project, setProject] = useState(boardProjectId ?? projects[0]?.id ?? 0);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(Boolean(project));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    let active = true;
    readDeliverableOptionsAction({ projectId: project })
      .then((result) => {
        if (!active) return;
        if (result.ok) setOptions(result.data);
        else setError(result.error.message);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(messages.errors.INTERNAL);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project]);
  return (
    <>
      <ErrorSummary message={error} />
      {boardProjectId === null ? (
        <BoardField name="sourceProject" label={M.project}>
          <Combobox
            name="sourceProject"
            defaultValue={String(project || "")}
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
            onSelect={(option) => {
              setLoading(Boolean(option));
              setError(null);
              setOptions([]);
              onSelect([]);
              setProject(Number(option?.value ?? 0));
            }}
          />
        </BoardField>
      ) : null}
      <BoardField name="keyDeliverableIds" label={S.deliverables}>
        <MultiSelect
          options={options}
          selected={options.filter((o) => selected.includes(o.id))}
          disabled={loading}
          inputName="selectedDeliverables"
          emptyPlaceholder={S.none}
          removeLabel={M.ui.removeRequirement}
          onAdd={(option) => onSelect([...selected, option.id])}
          onRemove={(id) => onSelect(selected.filter((item) => item !== id))}
        />
      </BoardField>
      {loading ? <p>{messages.app.loading}</p> : !options.length ? <p>{S.none}</p> : null}
    </>
  );
}
