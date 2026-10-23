"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { Menu, MenuButton } from "@/components/ui/menu";
import {
  CELL_SHADES,
  HIGHLIGHT_COLORS,
  LIST_START_MAX,
  NUMBERING_STYLES,
  TEXT_COLORS,
  listStart,
  type ColorName,
  type NumberingType,
} from "@/lib/rich-text/formats";
import { messages } from "@/lib/messages";
import { HighlightIcon, InsertIcon, ShadingIcon } from "./icons";

const t = messages.richText;

export const toolbarButtonClass =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-sm text-ink " +
  "hover:bg-surface-sunken aria-pressed:bg-accent-soft aria-disabled:cursor-default aria-disabled:opacity-50";

type SwatchKind = "text" | "highlight" | "shade";

/** A colour sample; globals.css (.rt-swatch) paints it with the same token the text uses. */
function Swatch({
  kind,
  color,
  className = "size-4",
}: {
  kind: SwatchKind;
  color: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-swatch={kind}
      data-color={color ?? "auto"}
      className={`rt-swatch shrink-0 rounded-sm border border-line ${className}`}
    />
  );
}

/** One colour menu: "none" first (automatic / no highlight / no shading), then the palette. */
function ColorMenu<C extends ColorName>({
  kind,
  palette,
  label,
  noneLabel,
  current,
  trigger,
  testId,
  onPick,
}: {
  kind: SwatchKind;
  palette: readonly C[];
  label: string;
  noneLabel: string;
  current: string | null;
  trigger: React.ReactNode;
  testId: string;
  onPick: (color: C | null) => void;
}) {
  return (
    <Menu
      label={label}
      trigger={trigger}
      triggerClassName={toolbarButtonClass}
      testId={testId}
      align="start"
    >
      <MenuButton checked={current === null} onClick={() => onPick(null)}>
        <Swatch kind={kind} color={null} />
        {noneLabel}
      </MenuButton>
      {palette.map((color) => (
        <MenuButton key={color} checked={current === color} onClick={() => onPick(color)}>
          <Swatch kind={kind} color={color} />
          {t.colors[color]}
        </MenuButton>
      ))}
    </Menu>
  );
}

export function TextColorMenu({ editor, current }: { editor: Editor; current: string | null }) {
  return (
    <ColorMenu
      kind="text"
      palette={TEXT_COLORS}
      label={t.textColor}
      noneLabel={t.automaticColor}
      current={current}
      testId="rich-text-color-menu"
      trigger={
        <span aria-hidden="true" className="flex flex-col items-center gap-0.5 leading-none">
          <span className="font-semibold">A</span>
          <Swatch kind="text" color={current} className="h-1 w-4" />
        </span>
      }
      onPick={(color) => {
        const chain = editor.chain().focus();
        (color ? chain.setTextColor(color) : chain.unsetTextColor()).run();
      }}
    />
  );
}

export function HighlightMenu({ editor, current }: { editor: Editor; current: string | null }) {
  return (
    <ColorMenu
      kind="highlight"
      palette={HIGHLIGHT_COLORS}
      label={t.highlight}
      noneLabel={t.noHighlight}
      current={current}
      testId="rich-text-highlight-menu"
      trigger={
        <span aria-hidden="true" className="flex flex-col items-center gap-0.5 leading-none">
          <HighlightIcon />
          <Swatch kind="highlight" color={current} className="h-1 w-4" />
        </span>
      }
      onPick={(color) => {
        const chain = editor.chain().focus();
        (color ? chain.setHighlight({ color }) : chain.unsetHighlight()).run();
      }}
    />
  );
}

export function ShadingMenu({ editor, current }: { editor: Editor; current: string | null }) {
  return (
    <ColorMenu
      kind="shade"
      palette={CELL_SHADES}
      label={t.cellShading}
      noneLabel={t.noShading}
      current={current}
      testId="rich-text-shading-menu"
      trigger={<ShadingIcon />}
      onPick={(shade) => editor.chain().focus().setCellShade(shade).run()}
    />
  );
}

/** Numbering style of the current list (turning the paragraph into one first), and its start. */
export function NumberingMenu({
  editor,
  current,
  start,
}: {
  editor: Editor;
  current: NumberingType | null;
  start: number;
}) {
  const [startOpen, setStartOpen] = useState(false);

  return (
    <>
      <Menu
        label={t.numberingStyle}
        trigger={<span aria-hidden="true">1.</span>}
        triggerClassName={toolbarButtonClass}
        testId="rich-text-numbering-menu"
        align="start"
      >
        {NUMBERING_STYLES.map((style) => (
          <MenuButton
            key={style.type}
            checked={current === style.type}
            onClick={() => editor.chain().focus().setNumbering({ type: style.type }).run()}
          >
            {t.numberingStyles[style.type]}
          </MenuButton>
        ))}
        <MenuButton onClick={() => setStartOpen(true)}>{t.startAt}</MenuButton>
      </Menu>
      <StartNumberDialog
        open={startOpen}
        initial={start}
        onOpenChange={setStartOpen}
        onApply={(value) => {
          setStartOpen(false);
          editor.chain().focus().setNumbering({ start: value }).run();
        }}
      />
    </>
  );
}

export function InsertMenu({ editor }: { editor: Editor }) {
  return (
    <Menu
      label={t.insert}
      trigger={<InsertIcon />}
      triggerClassName={toolbarButtonClass}
      testId="rich-text-insert-menu"
    >
      <MenuButton onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        {t.horizontalLine}
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().setPageBreak().run()}>
        {t.pageBreak}
      </MenuButton>
    </Menu>
  );
}

/** No <form>, as in the link dialog: React events would bubble into the editor's form. */
function StartNumberDialog({
  open,
  initial,
  onApply,
  onOpenChange,
}: {
  open: boolean;
  initial: number;
  onApply: (start: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t.startAt}>
      {open ? <StartNumberFields initial={initial} onApply={onApply} /> : null}
    </Dialog>
  );
}

function StartNumberFields({
  initial,
  onApply,
}: {
  initial: number;
  onApply: (start: number) => void;
}) {
  const [value, setValue] = useState(String(initial));
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const start = listStart(value);
    if (start === null) setInvalid(true);
    else onApply(start);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={t.startNumber}
        name="rich-text-list-start"
        errors={invalid ? [t.startNumberInvalid] : undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={LIST_START_MAX}
          step={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      <div className="flex justify-end">
        <Button onClick={apply}>{t.applyStart}</Button>
      </div>
    </div>
  );
}
