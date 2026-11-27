"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { messages } from "@/lib/messages";
import { saveMinutesSectionAction } from "../actions";
import { MINUTES_SECTION_TITLE_MAX, type MinutesSectionKey } from "../minutes-sections";
import type { WorkspaceSection } from "../schemas/meeting";
import { saveMinutesSectionSchema } from "../schemas/meeting-form";
import { useMinutes } from "./minutes-context";
import { MinutesForm } from "./minutes-forms";

const M = messages.meetings;

const textButton =
  "rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken hover:text-ink print:hidden";

/** Renames a built-in section, or adds or edits a box a user added. */
function SectionForm({
  row,
  sectionKey,
  title,
  withBody,
  onDone,
}: {
  row: WorkspaceSection | null;
  sectionKey: MinutesSectionKey | null;
  title: string;
  withBody: boolean;
  onDone: () => void;
}) {
  const { meetingId, answer } = useMinutes();
  return (
    <MinutesForm
      part={`section-${row?.MeetingMinutesSectionId ?? sectionKey ?? "new"}`}
      schema={saveMinutesSectionSchema}
      label={row || sectionKey ? M.renameSection(title) : M.addSection}
      testId="section-form"
      submit={saveMinutesSectionAction}
      onSaved={(workspace) => {
        answer(workspace, withBody);
        onDone();
      }}
      onClose={onDone}
    >
      {(errors) => (
        <>
          <input type="hidden" name="meetingId" value={meetingId} />
          <input
            type="hidden"
            name="meetingMinutesSectionId"
            value={row?.MeetingMinutesSectionId ?? ""}
          />
          <input type="hidden" name="sectionKey" value={sectionKey ?? ""} />
          <input type="hidden" name="rowVer" value={row?.RowVer ?? ""} />
          <Field label={M.sectionTitle} name="title" errors={errors.title}>
            <Input
              name="title"
              defaultValue={row?.Title ?? title}
              maxLength={MINUTES_SECTION_TITLE_MAX}
            />
          </Field>
          {withBody ? (
            <Field label={M.sectionBody} name="body" errors={errors.body}>
              <RichTextEditor name="body" defaultValue={row?.Body} />
            </Field>
          ) : (
            <input type="hidden" name="body" value={row?.Body ?? ""} />
          )}
        </>
      )}
    </MinutesForm>
  );
}

/** A built-in section's heading, under the title the meeting gave it. */
export function SectionHeading({
  sectionKey,
  fallback,
  heading,
}: {
  sectionKey: MinutesSectionKey;
  fallback: string;
  heading: (title: string) => React.ReactNode;
}) {
  const { canEdit, canDelete, askDelete, sections } = useMinutes();
  const [editing, setEditing] = useState(false);
  const row = sections.find((section) => section.SectionKey === sectionKey) ?? null;
  const title = row?.Title ?? fallback;

  if (editing) {
    return (
      <SectionForm
        row={row}
        sectionKey={sectionKey}
        title={title}
        withBody={false}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {heading(title)}
      {canEdit ? (
        <button
          type="button"
          className={textButton}
          aria-label={M.renameSection(title)}
          data-testid={`rename-${sectionKey}`}
          onClick={() => setEditing(true)}
        >
          {M.rename}
        </button>
      ) : null}
      {row && canDelete ? (
        <button
          type="button"
          className={textButton}
          onClick={() =>
            askDelete({
              kind: "section",
              id: row.MeetingMinutesSectionId,
              rowVer: row.RowVer,
              name: title,
            })
          }
        >
          {M.resetSectionTitle}
        </button>
      ) : null}
    </div>
  );
}

/** The boxes users added to the minutes, each with a title and formatted text, under the button that adds one. */
export function CustomSections({ sections }: { sections: WorkspaceSection[] }) {
  const { canEdit, canDelete, askDelete, sectionView } = useMinutes();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const boxes = sections.filter((section) => section.SectionKey === null);

  return (
    <div className="flex flex-col gap-4" data-testid="custom-sections">
      {canEdit ? (
        adding ? (
          <SectionForm
            row={null}
            sectionKey={null}
            title=""
            withBody
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start print:hidden"
            data-testid="add-section"
            onClick={() => setAdding(true)}
          >
            {M.addSection}
          </Button>
        )
      ) : null}
      {boxes.map((box) => {
        const id = box.MeetingMinutesSectionId;
        if (editingId === id) {
          return (
            <SectionForm
              key={id}
              row={box}
              sectionKey={null}
              title={box.Title}
              withBody
              onDone={() => setEditingId(null)}
            />
          );
        }
        return (
          <section
            key={id}
            aria-labelledby={`section-${id}-heading`}
            data-testid="custom-section"
            className="flex flex-col gap-2 rounded-md border border-line p-4"
          >
            <div className="flex flex-wrap items-center gap-1">
              <h3
                id={`section-${id}-heading`}
                className="text-sm font-medium text-ink wrap-anywhere"
              >
                {box.Title}
              </h3>
              {canEdit ? (
                <button
                  type="button"
                  className={textButton}
                  aria-label={M.editItem(box.Title)}
                  onClick={() => setEditingId(id)}
                >
                  {messages.actions.edit}
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className={textButton}
                  aria-label={M.deleteSection(box.Title)}
                  onClick={() =>
                    askDelete({ kind: "section", id, rowVer: box.RowVer, name: box.Title })
                  }
                >
                  {messages.actions.delete}
                </button>
              ) : null}
            </div>
            {box.Body ? (
              <div className="text-sm text-ink wrap-anywhere">{sectionView(box)}</div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
