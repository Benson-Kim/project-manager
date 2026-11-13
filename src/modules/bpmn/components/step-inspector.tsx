"use client";

import { useState } from "react";
import { BinIcon } from "@/components/ui/action-icons";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form/inputs";
import { ListSelect } from "@/components/ui/form/list-select";
import { messages } from "@/lib/messages";
import { RESPONSIBILITY_FRAMEWORKS } from "@/modules/stakeholders/schemas/responsibility-frameworks";
import {
  diagramFramework,
  DIAGRAM_LIMITS,
  type BpmnShape,
  type ShapeKind,
  type StepField,
} from "../model/diagram";
import {
  kindsLike,
  removeElements,
  setResponsibilityModel,
  setShapeKind,
  setShapeLabel,
  setStepDetail,
  setStepPerson,
} from "../model/edit";
import type { DiagramEditor } from "./use-diagram-editor";

const M = messages.bpmn;
const I = M.inspector;
const GENERAL = ["role", "duration", "sla"] as const;
const LABEL = "flex flex-col gap-0.5 text-[11px] text-ink-muted";

/** A text box that saves on leaving it or on Enter, so one edit is one Undo step. */
function DetailInput({
  label,
  value,
  testId,
  max = DIAGRAM_LIMITS.detail,
  onSave,
}: {
  label: string;
  value: string;
  testId: string;
  max?: number;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const save = () => {
    if (draft !== value) onSave(draft);
  };
  return (
    <label className={LABEL}>
      {label}
      <Input
        value={draft}
        maxLength={max}
        data-testid={testId}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
      />
    </label>
  );
}

/** The selected step's name, type, status, timing and RACI, and a way to delete it. */
export function StepInspector({
  editor,
  shape,
  canEdit,
  onDeleted,
}: {
  editor: DiagramEditor;
  shape: BpmnShape | null;
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const { change, diagram } = editor;
  const framework = diagramFramework(diagram);
  const detail = (id: string, field: StepField) => (value: string) =>
    change((d) => setStepDetail(d, id, field, value));
  const field = (id: string, name: (typeof GENERAL)[number]) => (
    <DetailInput
      key={name}
      label={I.fields[name]}
      value={shape?.step?.[name] ?? ""}
      testId={`bpmn-inspector-${name}`}
      onSave={detail(id, name)}
    />
  );
  return (
    <aside
      aria-label={I.title}
      data-testid="bpmn-inspector"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-line p-2 lg:border-t-0 lg:border-l print:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-muted">{I.title}</h3>
        {shape && canEdit ? (
          <Button
            type="button"
            size="compact"
            variant="danger"
            data-testid="bpmn-inspector-delete"
            aria-label={I.deleteStep}
            title={I.deleteStep}
            onClick={() => {
              change((d) => removeElements(d, new Set([shape.id])));
              onDeleted();
            }}
          >
            <BinIcon />
          </Button>
        ) : null}
      </div>
      {shape ? (
        <fieldset disabled={!canEdit} className="flex flex-col gap-2">
          <DetailInput
            label={I.label}
            value={shape.label}
            testId="bpmn-inspector-label"
            max={DIAGRAM_LIMITS.label}
            onSave={(value) => change((d) => setShapeLabel(d, shape.id, value))}
          />
          <label className={LABEL}>
            {I.type}
            <Select
              value={shape.kind}
              data-testid="bpmn-inspector-type"
              onChange={(event) =>
                change((d) => setShapeKind(d, shape.id, event.target.value as ShapeKind))
              }
            >
              {kindsLike(shape.kind).map((kind) => (
                <option key={kind} value={kind}>
                  {M.shapes[kind]}
                </option>
              ))}
            </Select>
          </label>
          <label className={LABEL}>
            {I.status}
            <ListSelect
              list="bpmn.step-status"
              column={I.status}
              current={shape.step?.status ?? null}
              value={shape.step?.status ?? ""}
              data-testid="bpmn-inspector-status"
              onChange={(event) => detail(shape.id, "status")(event.target.value)}
            >
              <option value="">{I.notSet}</option>
            </ListSelect>
          </label>
          {GENERAL.map((name) => field(shape.id, name))}
          <label className={LABEL}>
            {I.model}
            <Select
              value={framework.code}
              data-testid="bpmn-inspector-model"
              onChange={(event) => change((d) => setResponsibilityModel(d, event.target.value))}
            >
              {RESPONSIBILITY_FRAMEWORKS.map((each) => (
                <option key={each.code} value={each.code}>
                  {each.label}
                </option>
              ))}
            </Select>
          </label>
          {framework.roles.map((role) => (
            <DetailInput
              key={role.code}
              label={I.person(role.label, role.abbrev)}
              value={shape.step?.people?.[role.code] ?? ""}
              testId={`bpmn-inspector-person-${role.code.toLowerCase()}`}
              onSave={(value) => change((d) => setStepPerson(d, shape.id, role.code, value))}
            />
          ))}
        </fieldset>
      ) : (
        <p className="text-xs text-ink-muted">{I.empty}</p>
      )}
    </aside>
  );
}
