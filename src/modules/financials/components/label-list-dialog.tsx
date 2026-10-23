"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { LabelListEditor } from "@/components/ui/form/label-list-editor";
import { messages } from "@/lib/messages";
import { updateFinancialAction } from "../actions";
import type { SheetDto } from "../schemas/financial";
import { breakdownValues } from "./settings-panel";
import { useFinancialAction } from "./use-financial-action";

export type FinancialList = "costCategories" | "fundingSources";

/**
 * "Edit dropdown list: <field>" for one of the financial's own lists, opened from
 * "Edit list…" at the end of its dropdown, like the managed lists' editor
 * (ADR-0022): the same rows, then Cancel and Save. Saves the financial with
 * everything else as it is.
 */
export function LabelListDialog({
  sheet,
  list,
  column,
  open,
  onOpenChange,
}: {
  sheet: SheetDto;
  list: FinancialList;
  column: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={messages.lookupLists.edit(column)}>
      {open ? (
        <Editor sheet={sheet} list={list} column={column} onDone={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  );
}

function Editor({
  sheet,
  list,
  column,
  onDone,
}: {
  sheet: SheetDto;
  list: FinancialList;
  column: string;
  onDone: () => void;
}) {
  const f = sheet.financial;
  const [labels, setLabels] = useState<string[]>(f[list]);
  const action = useFinancialAction();
  const save = () =>
    action.run(
      () =>
        updateFinancialAction({
          financialId: f.id,
          rowVer: f.rowVer,
          ...breakdownValues(f),
          [list]: labels,
        }),
      { success: messages.lookupLists.saved(column), onSuccess: onDone },
    );

  return (
    <div className="flex flex-col gap-4" data-testid="label-list-dialog">
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {messages.financials.reload}
        </Button>
      ) : null}
      <LabelListEditor
        legend={column}
        hideLegend
        labels={f[list]}
        maxLength={150}
        errors={action.fieldErrors[list]}
        onChange={setLabels}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          {messages.actions.cancel}
        </Button>
        <Button onClick={save} pending={action.pending} data-testid="save-label-list">
          {messages.actions.save}
        </Button>
      </div>
    </div>
  );
}
