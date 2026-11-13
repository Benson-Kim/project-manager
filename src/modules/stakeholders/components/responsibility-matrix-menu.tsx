"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BinIcon } from "@/components/ui/action-icons";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form/inputs";
import { Menu, MenuButton, MenuSeparator } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import {
  RESPONSIBILITY_FRAMEWORKS,
  responsibilityFramework,
  type ResponsibilityFrameworkCode,
  type ResponsibilityRowKind,
} from "../schemas/responsibility-frameworks";
import type { ResponsibilityMatrixSummary } from "../schemas/responsibility-matrix";
import { RoleChips } from "./role-chips";

const t = messages.responsibility;
const LABEL = "flex flex-col gap-0.5 text-[11px] text-ink-muted";
const NAME_MAX = 100;
const ROW_KINDS = Object.keys(t.rowKinds) as ResponsibilityRowKind[];

export interface NewMatrix {
  name: string;
  frameworkCode: ResponsibilityFrameworkCode;
  rowKind: ResponsibilityRowKind;
}

type Open = "new" | "rename" | "delete" | null;

/** Switches between the project's matrices, and creates, renames or deletes one. */
export function ResponsibilityMatrixMenu({
  matrices,
  selected,
  can,
  onCreate,
  onRename,
  onDelete,
}: {
  matrices: readonly ResponsibilityMatrixSummary[];
  selected: ResponsibilityMatrixSummary | null;
  can: { create: boolean; update: boolean; delete: boolean };
  onCreate: (matrix: NewMatrix) => void;
  onRename: (matrix: ResponsibilityMatrixSummary, name: string) => void;
  onDelete: (matrix: ResponsibilityMatrixSummary) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const closed = (isOpen: boolean) => {
    if (!isOpen) setOpen(null);
  };
  const canRename = selected !== null && can.update;
  const canDelete = selected !== null && can.delete;
  if (matrices.length === 0 && !can.create) return null;

  return (
    <>
      <Menu
        label={t.matrices}
        align="start"
        testId="responsibility-matrix-menu"
        trigger={
          <>
            {selected
              ? `${selected.name} · ${responsibilityFramework(selected.frameworkCode).label}`
              : t.matrices}
            <Chevron />
          </>
        }
        triggerClassName={buttonClass("secondary", "compact")}
      >
        {matrices.map((each) => (
          <MenuButton
            key={each.id}
            checked={each.id === selected?.id}
            testId="responsibility-matrix-item"
            onClick={() => router.push(`?m=${each.id}`)}
          >
            {each.name}
          </MenuButton>
        ))}
        {matrices.length > 0 && (can.create || canRename) ? <MenuSeparator /> : null}
        {can.create ? (
          <MenuButton testId="responsibility-matrix-new" onClick={() => setOpen("new")}>
            {t.newMatrix}
          </MenuButton>
        ) : null}
        {canRename ? (
          <MenuButton testId="responsibility-matrix-rename" onClick={() => setOpen("rename")}>
            {t.renameTitle}
          </MenuButton>
        ) : null}
        {canDelete ? (
          <>
            <MenuSeparator />
            <MenuButton
              testId="responsibility-matrix-delete"
              tone="danger"
              icon={<BinIcon />}
              onClick={() => setOpen("delete")}
            >
              {t.deleteMatrix}
            </MenuButton>
          </>
        ) : null}
      </Menu>
      <Dialog open={open === "new"} onOpenChange={closed} title={t.newMatrix}>
        <NewMatrixForm
          onCancel={() => setOpen(null)}
          onSubmit={(matrix) => {
            setOpen(null);
            onCreate(matrix);
          }}
        />
      </Dialog>
      {selected ? (
        <>
          <Dialog open={open === "rename"} onOpenChange={closed} title={t.renameTitle}>
            <RenameForm
              name={selected.name}
              onCancel={() => setOpen(null)}
              onSubmit={(name) => {
                setOpen(null);
                if (name !== selected.name) onRename(selected, name);
              }}
            />
          </Dialog>
          <ConfirmDialog
            open={open === "delete"}
            onOpenChange={closed}
            title={t.deleteTitle(selected.name)}
            body={t.deleteBody}
            confirmLabel={t.delete}
            onConfirm={() => {
              setOpen(null);
              onDelete(selected);
            }}
          />
        </>
      ) : null}
    </>
  );
}

function NewMatrixForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (matrix: NewMatrix) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [frameworkCode, setFrameworkCode] = useState<ResponsibilityFrameworkCode>(
    RESPONSIBILITY_FRAMEWORKS[0].code,
  );
  const [rowKind, setRowKind] = useState<ResponsibilityRowKind>(
    RESPONSIBILITY_FRAMEWORKS[0].defaultRowKind,
  );
  const framework = responsibilityFramework(frameworkCode);
  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed) onSubmit({ name: trimmed, frameworkCode, rowKind });
      }}
    >
      <label className={LABEL}>
        {t.name}
        <Input
          data-testid="responsibility-new-name"
          value={name}
          maxLength={NAME_MAX}
          required
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className={LABEL}>
        {t.framework}
        <Select
          data-testid="responsibility-new-framework"
          value={frameworkCode}
          onChange={(event) => {
            const code = event.target.value as ResponsibilityFrameworkCode;
            setFrameworkCode(code);
            setRowKind(responsibilityFramework(code).defaultRowKind);
          }}
        >
          {RESPONSIBILITY_FRAMEWORKS.map((each) => (
            <option key={each.code} value={each.code}>
              {each.label}
            </option>
          ))}
        </Select>
      </label>
      <RoleChips framework={framework} />
      <label className={LABEL}>
        {t.rowKind}
        <Select
          data-testid="responsibility-new-rows"
          value={rowKind}
          onChange={(event) => setRowKind(event.target.value as ResponsibilityRowKind)}
        >
          {ROW_KINDS.map((each) => (
            <option key={each} value={each}>
              {t.rowKinds[each]}
            </option>
          ))}
        </Select>
      </label>
      <DialogActions onCancel={onCancel}>
        <Button type="submit" disabled={!name.trim()} data-testid="responsibility-new-save">
          {t.create}
        </Button>
      </DialogActions>
    </form>
  );
}

function RenameForm({
  name,
  onSubmit,
  onCancel,
}: {
  name: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label className={LABEL}>
        {t.name}
        <Input
          data-testid="responsibility-rename-name"
          value={value}
          maxLength={NAME_MAX}
          required
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <DialogActions onCancel={onCancel}>
        <Button type="submit" disabled={!value.trim()} data-testid="responsibility-rename-save">
          {messages.actions.save}
        </Button>
      </DialogActions>
    </form>
  );
}
