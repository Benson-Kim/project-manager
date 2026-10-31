"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { MAX_CRITERIA_LENGTH } from "@/modules/requirements/schemas/requirement-planning";

const D = messages.boards.drawer;

/**
 * A requirement's acceptance criteria in the card drawer: read in place, edited on demand. The
 * textarea has no name, so the card form never submits it or counts it as an unsaved edit.
 */
export function CriteriaEditor({
  value,
  label,
  canEdit,
  disabled,
  onSave,
}: {
  value: string | null;
  label: string;
  canEdit: boolean;
  disabled: boolean;
  onSave: (criteria: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <div className="flex flex-col items-start gap-1">
        {value ? <p className="whitespace-pre-wrap text-xs text-ink-muted">{value}</p> : null}
        {canEdit ? (
          <Button
            variant="ghost"
            className="min-h-8 px-2 text-xs"
            disabled={disabled}
            onClick={() => setDraft(value ?? "")}
          >
            {value ? D.editCriteria : D.addCriteria}
          </Button>
        ) : null}
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        aria-label={label}
        value={draft}
        rows={3}
        maxLength={MAX_CRITERIA_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          className="min-h-8 px-3 text-xs"
          disabled={disabled}
          onClick={() => {
            onSave(draft);
            setDraft(null);
          }}
        >
          {D.saveCriteria}
        </Button>
        <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => setDraft(null)}>
          {messages.actions.cancel}
        </Button>
      </div>
    </div>
  );
}
