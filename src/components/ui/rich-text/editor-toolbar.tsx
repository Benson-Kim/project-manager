"use client";

import { type Editor, useEditorState } from "@tiptap/react";
import { useLayoutEffect, useRef } from "react";
import { Menu, MenuButton } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import {
  AlignIcon,
  BulletListIcon,
  ClearFormattingIcon,
  LinkIcon,
  OrderedListIcon,
  RedoIcon,
  TableIcon,
  UndoIcon,
} from "./icons";
import {
  FONT_FAMILIES,
  FONT_SIZES_PT,
  primaryFontFamily,
  rovingIndex,
  withCurrentOption,
} from "./toolbar-model";

const t = messages.richText;

const ALIGNMENTS = [
  { value: "left", label: t.alignLeft },
  { value: "center", label: t.alignCenter },
  { value: "right", label: t.alignRight },
  { value: "justify", label: t.alignJustify },
] as const;

const HEADINGS = [
  { level: 2, label: t.heading2 },
  { level: 3, label: t.heading3 },
  { level: 4, label: t.heading4 },
] as const;

const FONT_SIZE_OPTIONS = FONT_SIZES_PT.map((pt) => `${pt}pt`);

// Toolbar stops: buttons and selects, but not the table menu's items.
const ITEMS = 'button:not([role="menuitem"]), select';

const buttonClass =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-sm text-ink " +
  "hover:bg-surface-sunken aria-pressed:bg-accent-soft aria-disabled:cursor-default aria-disabled:opacity-50";

const selectClass =
  "min-h-11 shrink-0 cursor-pointer rounded-md border border-line bg-surface px-2 text-sm text-ink";

/**
 * Formatting toolbar (ARIA toolbar pattern): one tab stop, arrows/Home/End
 * move between controls. Buttons keep the editor focused on mouse use
 * (mousedown is cancelled) and stay focused on keyboard use, so several
 * formats can be applied in a row. aria-disabled, not disabled, keeps every
 * control reachable. Selects apply on change; a pointer pick returns focus to
 * the text, as Word does.
 */
export function EditorToolbar({ editor, onOpenLink }: { editor: Editor; onOpenLink: () => void }) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(0);
  const pointerPick = useRef(false);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string };
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        heading: HEADINGS.find((h) => e.isActive("heading", { level: h.level }))?.level ?? 0,
        align: ALIGNMENTS.find((a) => e.isActive({ textAlign: a.value }))?.value ?? "left",
        fontFamily: primaryFontFamily(style.fontFamily),
        fontSize: style.fontSize ?? "",
        link: e.isActive("link"),
        inTable: e.isActive("table"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  const items = () =>
    Array.from(toolbarRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []).filter(
      (el) => !el.closest('[role="menu"]'),
    );

  // Roving tabindex, set on the DOM: the controls carry no tabIndex prop, so
  // React never resets it on re-render.
  const applyTabStops = () => {
    const list = items();
    const active = Math.min(activeIndex.current, list.length - 1);
    list.forEach((el, i) => (el.tabIndex = i === active ? 0 : -1));
  };
  useLayoutEffect(applyTabStops);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[role="menu"]')) return;
    const list = items();
    const next = rovingIndex(list.indexOf(target), event.key, list.length);
    if (next === null) return;
    event.preventDefault();
    activeIndex.current = next;
    applyTabStops();
    list[next]?.focus();
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const index = items().indexOf(event.target as HTMLElement);
    if (index < 0) return;
    activeIndex.current = index;
    applyTabStops();
  };

  /** After a select change: back to the text when picked with the pointer. */
  const afterPick = () => {
    if (pointerPick.current) editor.commands.focus();
    pointerPick.current = false;
  };
  const selectEvents = {
    onPointerDown: () => (pointerPick.current = true),
    onKeyDown: () => (pointerPick.current = false),
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={t.toolbar}
      className="flex flex-wrap items-center gap-1 border-b border-line p-1"
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <ToolButton
        label={messages.actions.undo}
        shortcut="Control+Z"
        disabled={!state.canUndo}
        onRun={() => editor.chain().undo().run()}
      >
        <UndoIcon />
      </ToolButton>
      <ToolButton
        label={t.redo}
        shortcut="Control+Y"
        disabled={!state.canRedo}
        onRun={() => editor.chain().redo().run()}
      >
        <RedoIcon />
      </ToolButton>
      <Divider />

      <select
        aria-label={t.textStyle}
        className={selectClass}
        value={state.heading}
        {...selectEvents}
        onChange={(event) => {
          const level = Number(event.target.value) as 0 | 2 | 3 | 4;
          if (level === 0) editor.chain().setParagraph().run();
          else editor.chain().setHeading({ level }).run();
          afterPick();
        }}
      >
        <option value={0}>{t.paragraph}</option>
        {HEADINGS.map((h) => (
          <option key={h.level} value={h.level}>
            {h.label}
          </option>
        ))}
      </select>
      <select
        aria-label={t.fontFamily}
        className={`${selectClass} w-36`}
        value={state.fontFamily}
        {...selectEvents}
        onChange={(event) => {
          const family = event.target.value;
          if (family) editor.chain().setFontFamily(family).run();
          else editor.chain().unsetFontFamily().run();
          afterPick();
        }}
      >
        <option value="">{t.defaultFont}</option>
        {withCurrentOption(FONT_FAMILIES, state.fontFamily).map((family) => (
          <option key={family} value={family} style={{ fontFamily: family }}>
            {family}
          </option>
        ))}
      </select>
      <select
        aria-label={t.fontSize}
        className={selectClass}
        value={state.fontSize}
        {...selectEvents}
        onChange={(event) => {
          const size = event.target.value;
          if (size) editor.chain().setFontSize(size).run();
          else editor.chain().unsetFontSize().run();
          afterPick();
        }}
      >
        <option value="">{t.defaultSize}</option>
        {withCurrentOption(FONT_SIZE_OPTIONS, state.fontSize).map((size) => (
          <option key={size} value={size}>
            {size.replace(/pt$/, "")}
          </option>
        ))}
      </select>
      <Divider />

      <ToolButton
        label={t.bold}
        shortcut="Control+B"
        pressed={state.bold}
        onRun={() => editor.chain().toggleBold().run()}
      >
        <span aria-hidden="true" className="font-bold">
          B
        </span>
      </ToolButton>
      <ToolButton
        label={t.italic}
        shortcut="Control+I"
        pressed={state.italic}
        onRun={() => editor.chain().toggleItalic().run()}
      >
        <span aria-hidden="true" className="font-serif italic">
          I
        </span>
      </ToolButton>
      <ToolButton
        label={t.underline}
        shortcut="Control+U"
        pressed={state.underline}
        onRun={() => editor.chain().toggleUnderline().run()}
      >
        <span aria-hidden="true" className="underline">
          U
        </span>
      </ToolButton>
      <ToolButton
        label={t.strike}
        shortcut="Control+Shift+X"
        pressed={state.strike}
        onRun={() => editor.chain().toggleStrike().run()}
      >
        <span aria-hidden="true" className="line-through">
          S
        </span>
      </ToolButton>
      <Divider />

      <ToolButton
        label={t.bulletList}
        pressed={state.bulletList}
        onRun={() => editor.chain().toggleBulletList().run()}
      >
        <BulletListIcon />
      </ToolButton>
      <ToolButton
        label={t.orderedList}
        pressed={state.orderedList}
        onRun={() => editor.chain().toggleOrderedList().run()}
      >
        <OrderedListIcon />
      </ToolButton>
      <Divider />

      {ALIGNMENTS.map((a) => (
        <ToolButton
          key={a.value}
          label={a.label}
          pressed={state.align === a.value}
          onRun={() => editor.chain().setTextAlign(a.value).run()}
        >
          <AlignIcon align={a.value} />
        </ToolButton>
      ))}
      <Divider />

      <ToolButton label={t.link} shortcut="Control+K" pressed={state.link} onRun={onOpenLink}>
        <LinkIcon />
      </ToolButton>
      <Menu
        label={t.table}
        trigger={<TableIcon />}
        triggerClassName={buttonClass}
        testId="rich-text-table-menu"
      >
        {state.inTable ? (
          <>
            <MenuButton onClick={() => editor.chain().focus().addRowBefore().run()}>
              {t.addRowBefore}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().addRowAfter().run()}>
              {t.addRowAfter}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteRow().run()}>
              {t.deleteRow}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().addColumnBefore().run()}>
              {t.addColumnBefore}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().addColumnAfter().run()}>
              {t.addColumnAfter}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteColumn().run()}>
              {t.deleteColumn}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
              {t.toggleHeaderRow}
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteTable().run()}>
              {t.deleteTable}
            </MenuButton>
          </>
        ) : (
          <MenuButton
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            {t.insertTable}
          </MenuButton>
        )}
      </Menu>
      <Divider />

      <ToolButton
        label={t.clearFormatting}
        onRun={() => editor.chain().unsetAllMarks().clearNodes().unsetTextAlign().run()}
      >
        <ClearFormattingIcon />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  pressed,
  disabled = false,
  onRun,
  children,
}: {
  label: string;
  shortcut?: string;
  /** Toggle state; omit for one-shot actions. */
  pressed?: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={buttonClass}
      // Keep the text selection and focus in the editor on mouse use.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!disabled) onRun();
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-line" />;
}
