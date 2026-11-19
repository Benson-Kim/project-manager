"use client";

import { Panel } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Select, Switch } from "@/components/ui/form/inputs";
import {
  LINE_ATTACH,
  LINE_COLOURS,
  LINE_ENDS,
  LINE_PATTERNS,
  LINE_SHAPES,
  LINE_SIDES,
  LINE_WEIGHTS,
  PLAIN_STYLE,
  type ConnectorStyle,
} from "@/lib/connector-style";
import { messages } from "@/lib/messages";
import { lookOf, type LinkLook } from "../../canvas/link-layout";
import type { CanvasLink } from "../../schemas/canvas";

const M = messages.requirements.canvas.lineStyle;
const WEIGHTS = Array.from(
  { length: LINE_WEIGHTS.max - LINE_WEIGHTS.min + 1 },
  (_, i) => i + LINE_WEIGHTS.min,
);

function Choice<T extends string>({
  field,
  label,
  value,
  options,
  names,
  onChange,
}: {
  field: string;
  label: string;
  value: T | null;
  options: readonly T[];
  names: Record<T, string>;
  onChange: (value: T | null) => void;
}) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm text-ink">
      {label}
      <Select
        data-testid={`canvas-link-style-${field}`}
        className="py-1"
        value={value ?? ""}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
      >
        <option value="">{M.auto}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {names[option]}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** The look of one line. Each change saves at once and is one Undo step. */
export function LinkStylePanel({
  link,
  onStyle,
  onClose,
}: {
  link: CanvasLink;
  onStyle: (look: LinkLook) => void;
  onClose: () => void;
}) {
  const look = lookOf(link);
  const { style } = look;
  const set = (change: Partial<ConnectorStyle>) =>
    onStyle({ ...look, style: { ...style, ...change } });

  return (
    <Panel position="top-right" data-canvas-chrome className="print:hidden">
      <section
        data-testid="canvas-link-style"
        aria-label={M.title}
        className="grid w-72 gap-2 rounded-md border border-line bg-surface-raised p-3 shadow"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">{M.title}</h2>
          <Button
            variant="secondary"
            size="compact"
            data-testid="canvas-link-style-close"
            aria-label={M.close}
            onClick={onClose}
          >
            ×
          </Button>
        </header>
        <Choice
          field="shape"
          label={M.shape}
          value={style.shape}
          options={LINE_SHAPES}
          names={M.shapes}
          onChange={(shape) => set({ shape })}
        />
        <Choice
          field="pattern"
          label={M.pattern}
          value={style.pattern}
          options={LINE_PATTERNS}
          names={M.patterns}
          onChange={(pattern) => set({ pattern })}
        />
        <Choice
          field="start"
          label={M.start}
          value={style.startEnd}
          options={LINE_ENDS}
          names={M.ends}
          onChange={(startEnd) => set({ startEnd })}
        />
        <Choice
          field="end"
          label={M.end}
          value={style.endEnd}
          options={LINE_ENDS}
          names={M.ends}
          onChange={(endEnd) => set({ endEnd })}
        />
        <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm text-ink">
          {M.weight}
          <Select
            data-testid="canvas-link-style-weight"
            className="py-1"
            value={style.weight ?? ""}
            onChange={(event) =>
              set({ weight: event.target.value ? Number(event.target.value) : null })
            }
          >
            <option value="">{M.auto}</option>
            {WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm text-ink">
          <legend className="float-left">{M.colour}</legend>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-testid="canvas-link-style-colour-auto"
              aria-label={M.auto}
              aria-pressed={style.colour === null}
              onClick={() => set({ colour: null })}
              className="size-6 rounded-full border border-line bg-surface aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-focus"
            />
            {LINE_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                data-testid={`canvas-link-style-colour-${colour.slice(1)}`}
                aria-label={M.colourName(colour)}
                aria-pressed={style.colour?.toUpperCase() === colour}
                onClick={() => set({ colour })}
                style={{ backgroundColor: colour }}
                className="size-6 rounded-full aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-focus"
              />
            ))}
          </div>
        </fieldset>
        <Choice
          field="attach"
          label={M.attach}
          value={style.attach}
          options={LINE_ATTACH}
          names={M.attaches}
          onChange={(attach) => set({ attach })}
        />
        {style.attach === "floating" ? null : (
          <>
            <Choice
              field="from"
              label={M.from}
              value={style.sourceSide}
              options={LINE_SIDES}
              names={M.sides}
              onChange={(sourceSide) => set({ sourceSide })}
            />
            <Choice
              field="to"
              label={M.to}
              value={style.targetSide}
              options={LINE_SIDES}
              names={M.sides}
              onChange={(targetSide) => set({ targetSide })}
            />
          </>
        )}
        <Switch
          data-testid="canvas-link-style-jumps"
          label={M.jumps}
          checked={style.jumps === true}
          onChange={(event) => set({ jumps: event.target.checked || null })}
        />
        <Button
          variant="secondary"
          size="compact"
          data-testid="canvas-link-style-reset"
          onClick={() => onStyle({ ...look, style: PLAIN_STYLE })}
        >
          {M.reset}
        </Button>
      </section>
    </Panel>
  );
}
