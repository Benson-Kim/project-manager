"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renamedValue, type LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { ListEditorDialog } from "../data-view/list-editor-dialog";
import { EDIT_LIST, ListOptions, useLookupLists } from "../lookup-lists";
import { useFieldContext } from "./field";
import { Select } from "./inputs";

type OpenListEditor = (list: LookupListKey, column: string) => void;

const ListEditorContext = createContext<OpenListEditor | null>(null);

/**
 * Opens the list editor for any ListSelect inside, from outside their tree: React
 * bubbles portal events to the opener, so a dialog rendered there would hand its
 * typing, clicks and changes to the sheet form, WBS box or Gantt card around it.
 */
export function ListEditorHost({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState<{ list: LookupListKey; column: string } | null>(null);
  const open = useMemo<OpenListEditor>(() => (list, column) => setEditing({ list, column }), []);
  return (
    <ListEditorContext value={open}>
      {children}
      {editing ? (
        <ListEditorDialog
          listKey={editing.list}
          column={editing.column}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      ) : null}
    </ListEditorContext>
  );
}

export interface ListSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  list: LookupListKey;
  /** Names the list in the editor's title; defaults to the surrounding Field's label. */
  column?: string;
  /** The record's stored value (label, or option id for id-bound lists). */
  current?: string | number | null;
  /** Label of `current` for id-bound lists. */
  currentLabel?: string | null;
  /** A plain select the caller styles, instead of the form field's. */
  bare?: boolean;
}

/**
 * A select bound to a managed list (ADR-0022): the caller's empty option
 * (children), the list's options and, for Admins inside a ListEditorHost,
 * "Edit list…", which opens the list editor without changing the value. After
 * a save an uncontrolled select stays on the option it showed, under its new name.
 */
export const ListSelect = forwardRef<HTMLSelectElement, ListSelectProps>(function ListSelect(
  { list, column, current, currentLabel, bare = false, children, onFocus, onChange, ...props },
  ref,
) {
  const { lists, canEdit } = useLookupLists();
  const openEditor = useContext(ListEditorContext);
  const field = useFieldContext();
  const select = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => select.current as HTMLSelectElement, []);
  const options = lists[list];
  const shownList = useRef(options);
  const shown = useRef("");
  const controlled = props.value !== undefined;
  const Control = bare ? "select" : Select;

  useLayoutEffect(() => {
    const el = select.current;
    if (!el) return;
    const before = shownList.current;
    shownList.current = options;
    if (!controlled && before !== options) {
      const next = renamedValue(before, options, shown.current);
      if (next !== shown.current) el.value = next;
    }
    shown.current = el.value;
  }, [options, controlled]);

  return (
    <Control
      ref={select}
      {...props}
      onFocus={(e) => {
        shown.current = e.currentTarget.value;
        onFocus?.(e);
      }}
      onChange={(e) => {
        if (e.currentTarget.value === EDIT_LIST) {
          e.stopPropagation();
          e.currentTarget.value = shown.current;
          openEditor?.(list, column ?? field?.label ?? "");
          return;
        }
        shown.current = e.currentTarget.value;
        onChange?.(e);
      }}
    >
      {children}
      <ListOptions list={list} current={current} currentLabel={currentLabel} />
      {canEdit && openEditor ? (
        <option value={EDIT_LIST}>{messages.lookupLists.editInline}</option>
      ) : null}
    </Control>
  );
});
