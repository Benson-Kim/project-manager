"use client";

import { useMemo, useState } from "react";
import { Attachments } from "@/components/ui/attachments/attachments";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { Panel } from "@/components/ui/panel";
import { messages } from "@/lib/messages";
import {
  copyDocumentsAction,
  deleteDocumentAction,
  moveDocumentAction,
  updateDocumentAction,
} from "../actions";
import {
  documentSuggestion,
  documentSummary,
  requiredLabel,
  suggestionContext,
} from "../calc/documents";
import { calculateSheet } from "../calc/sheet";
import { DOCUMENT_LIMITS, type DocumentDto } from "../schemas/documents";
import type { SheetDto } from "../schemas/financial";
import { DocumentDialog } from "./document-dialog";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials.documents;

/**
 * "Financial documents required?" (ADR-0030, PPTX slide 2): the financial's own
 * checklist, each document required, not required or not decided, the reason
 * for not creating it, the reason a rule suggests from the budget (advisory,
 * one click to use it, never enforced) and its files. Cards, so nothing scrolls
 * sideways at 360 px. Viewers read and download; writes follow 'financials'.
 */
export function DocumentsPanel({
  sheet,
  templates,
  canCreate,
  canEdit,
  canDelete,
  uploadsEnabled,
}: {
  sheet: SheetDto;
  templates: { id: number; name: string; isDefault: boolean }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  uploadsEnabled: boolean;
}) {
  const ctx = useMemo(() => suggestionContext(sheet, calculateSheet(sheet).plan), [sheet]);
  const summary = documentSummary(sheet.documents);
  const [editing, setEditing] = useState<{ document: DocumentDto | null } | null>(null);
  const [removing, setRemoving] = useState<DocumentDto | null>(null);
  const [templateId, setTemplateId] = useState(
    String(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? ""),
  );
  const action = useFinancialAction();
  const f = sheet.financial;

  const move = (d: DocumentDto, direction: "up" | "down") =>
    action.run(() => moveDocumentAction({ documentId: d.id, direction, rowVer: d.rowVer }));

  const applyReason = (d: DocumentDto, reason: string) =>
    action.run(() =>
      updateDocumentAction({
        documentId: d.id,
        rowVer: d.rowVer,
        name: d.name,
        required: d.required ?? false,
        reason,
        suggestions: d.suggestions,
      }),
    );

  const copy = () =>
    action.run(() => copyDocumentsAction({ financialId: f.id, templateId: Number(templateId) }), {
      success: (data) => M.copied(data.added),
    });

  return (
    <Panel id="documents-heading" title={M.heading} testId="documents-panel">
      <div>
        <p className="text-sm text-ink-muted">{M.intro}</p>
        <p className="mt-1 text-sm text-ink" data-testid="documents-summary">
          {M.summary(summary.required, summary.requiredWithFile, summary.undecided)}
        </p>
      </div>
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {messages.financials.reload}
        </Button>
      ) : null}

      {sheet.documents.length === 0 ? <p className="text-sm text-ink-muted">{M.empty}</p> : null}
      <ol className="flex flex-col gap-3">
        {sheet.documents.map((d, index) => {
          const match = documentSuggestion(d, ctx);
          const reasonTyped = (d.reason ?? "").trim() !== "";
          return (
            <li
              key={d.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3"
              data-testid={`document-${d.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words font-medium text-ink">{d.name}</h3>
                  <p
                    className={`text-sm ${d.required === null ? "text-ink-muted" : "text-ink"}`}
                    data-testid="document-required"
                  >
                    {requiredLabel(d.required)}
                    {d.fileCount > 0 ? ` · ${M.fileCount(d.fileCount)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {canEdit ? (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing({ document: d })}
                        aria-label={M.edit(d.name)}
                      >
                        {messages.actions.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={index === 0 || action.pending}
                        onClick={() => move(d, "up")}
                        aria-label={M.moveUp(d.name)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={index === sheet.documents.length - 1 || action.pending}
                        onClick={() => move(d, "down")}
                        aria-label={M.moveDown(d.name)}
                      >
                        ↓
                      </Button>
                    </>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      onClick={() => setRemoving(d)}
                      aria-label={M.remove(d.name)}
                    >
                      {M.removeLabel}
                    </Button>
                  ) : null}
                </div>
              </div>

              {reasonTyped ? (
                <div>
                  <p className="text-xs font-medium text-ink-muted">{M.reason}</p>
                  <p
                    className="whitespace-pre-wrap break-words text-sm text-ink"
                    data-testid="document-reason"
                  >
                    {d.reason}
                  </p>
                </div>
              ) : null}

              {match && (!reasonTyped || d.reason !== match.reason) ? (
                <div
                  className="flex flex-col gap-2 rounded-md bg-surface-raised p-2 text-sm"
                  data-testid="document-suggestion"
                >
                  <p className="text-ink-muted">
                    <span className="font-medium text-ink">{M.suggestion}: </span>
                    {match.detail}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-ink">{match.reason}</p>
                  {canEdit && !reasonTyped && d.required !== true ? (
                    <div>
                      <Button
                        variant="secondary"
                        pending={action.pending}
                        onClick={() => applyReason(d, match.reason)}
                        aria-label={`${M.useSuggestion}: ${d.name}`}
                        data-testid="use-suggestion"
                      >
                        {M.useSuggestion}
                      </Button>
                    </div>
                  ) : null}
                  {reasonTyped && d.reason !== match.reason ? (
                    <p className="text-xs text-ink-muted">{M.kept}</p>
                  ) : null}
                </div>
              ) : null}

              <Attachments
                owner="financial-document"
                ownerId={d.id}
                files={sheet.documentFiles[d.id] ?? []}
                canAdd={canEdit}
                canRemove={canEdit}
                uploadsEnabled={uploadsEnabled}
              />
            </li>
          );
        })}
      </ol>

      {canCreate ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Button
            onClick={() => setEditing({ document: null })}
            disabled={sheet.documents.length >= DOCUMENT_LIMITS.perFinancial}
            title={sheet.documents.length >= DOCUMENT_LIMITS.perFinancial ? M.tooMany : undefined}
            data-testid="add-document"
          >
            {M.add}
          </Button>
          {templates.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div>
                <Field label={M.copyFromTemplate} name="copy-template">
                  <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="mt-1 text-xs text-ink-muted">{M.copyNote}</p>
              </div>
              <Button
                variant="secondary"
                onClick={copy}
                pending={action.pending}
                disabled={!templateId}
                data-testid="copy-documents"
              >
                {M.copy}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <DocumentDialog
          financialId={f.id}
          document={editing.document}
          otherNames={sheet.documents
            .filter((d) => d.id !== editing.document?.id)
            .map((d) => d.name)}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title={`${M.remove(removing.name)}?`}
          body={M.removeBody}
          confirmLabel={M.removeLabel}
          pending={action.pending}
          onConfirm={() =>
            action.run(
              () => deleteDocumentAction({ documentId: removing.id, rowVer: removing.rowVer }),
              { success: messages.feedback.deleted, onSuccess: () => setRemoving(null) },
            )
          }
        />
      ) : null}
    </Panel>
  );
}
