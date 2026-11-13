"use client";

import { type ReactNode, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { Input } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { formatNumber } from "../../calc/project-format";

export type UseValue = (value: number | null, label: string, display?: string) => void;
export type Category = keyof typeof messages.financials.projectMath.categories;

export interface CardProps {
  onUse: UseValue;
  currency: string;
}

const TONE_CLASS = {
  good: "text-success",
  bad: "text-danger",
  warn: "text-warning",
  accent: "text-accent-strong",
  neutral: "text-ink",
} as const;

export type ValueTone = keyof typeof TONE_CLASS;

const ICON_TONE = {
  neutral: "bg-accent-soft text-ink",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

const GRID_COLS = {
  1: "grid-cols-1",
  2: "grid-cols-1 @sm:grid-cols-2",
  3: "grid-cols-1 @sm:grid-cols-3",
  5: "grid-cols-2 @sm:grid-cols-5",
} as const;

const label = "text-[0.6875rem] font-semibold tracking-wide text-ink-muted uppercase";
const code = "rounded-sm bg-surface-sunken px-1 font-mono text-[0.6875rem] text-ink";

export function Field({
  label: text,
  value,
  onChange,
  code: symbol,
  prefix,
  kind = "number",
  labelHidden = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  code?: string;
  prefix?: string;
  kind?: "number" | "text" | "date";
  labelHidden?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={labelHidden ? "sr-only" : `${label} flex items-center gap-1.5`}>
        {text}
        {symbol ? <b className={code}>{symbol}</b> : null}
      </span>
      <span className="relative flex items-center">
        {prefix ? (
          <span className="pointer-events-none absolute left-2 text-sm text-ink-muted">
            {prefix}
          </span>
        ) : null}
        <Input
          type={kind === "date" ? "date" : "text"}
          inputMode={kind === "number" ? "decimal" : undefined}
          spellCheck={kind === "text"}
          className={`${kind === "text" ? "" : "font-mono"} ${prefix ? "pl-6" : ""}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

export function StaticField({
  label: text,
  value,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: string;
  tone?: ValueTone;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={label}>{text}</span>
      <output
        data-testid={testId}
        className={`flex min-h-9 items-center truncate rounded-md bg-surface-sunken px-2.5 font-mono text-sm ${TONE_CLASS[tone]}`}
      >
        {value}
      </output>
    </div>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 | 5 }) {
  return <div className={`grid gap-2.5 ${GRID_COLS[cols]}`}>{children}</div>;
}

/** Sized by its own width, so a card in the two-column grid lays out like one on a phone. */
export function Card({
  icon,
  name,
  tone = "neutral",
  children,
}: {
  icon: string;
  name: string;
  tone?: keyof typeof ICON_TONE;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={name}
      className="@container flex flex-col gap-3.5 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`grid size-8 flex-none place-items-center rounded-md text-sm ${ICON_TONE[tone]}`}
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-ink">{name}</h3>
      </div>
      {children}
    </section>
  );
}

export function Hero({
  label: text,
  value,
  unit,
  tone = "accent",
  badge,
  testId,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: ValueTone;
  badge?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div className={label}>{text}</div>
        <div
          data-testid={testId}
          className={`font-mono text-2xl font-semibold tracking-tight @[20rem]:text-3xl ${TONE_CLASS[tone]}`}
        >
          {value}
          {unit ? <span className="ml-1.5 text-sm font-normal text-ink-muted">{unit}</span> : null}
        </div>
      </div>
      {badge}
    </div>
  );
}

export function Kv({
  label: text,
  code: symbol,
  value,
  tone = "neutral",
  chip,
}: {
  label: string;
  code?: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
  chip?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        {symbol ? <code className={`${code} shrink-0`}>{symbol}</code> : null}
        {text}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`font-mono text-sm font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}>
          {value}
        </span>
        {chip}
      </span>
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-t border-line pt-2">{children}</div>;
}

export function MiniStat({
  label: text,
  value,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: string;
  tone?: ValueTone;
  testId?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-2.5">
      <div className="truncate text-[0.625rem] font-semibold tracking-wide text-ink-muted uppercase">
        {text}
      </div>
      <div
        data-testid={testId}
        className={`mt-1 truncate font-mono text-base font-semibold ${TONE_CLASS[tone]}`}
      >
        {value}
      </div>
    </div>
  );
}

export function Note({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <p
      className={`border-l-2 pl-2.5 text-xs ${
        tone === "warning" ? "border-warning text-warning" : "border-line text-ink-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** Types the exact value into the calculator's sum; the button shows the value it sends. */
export function PipeButton({
  value,
  label: text,
  display,
  onUse,
  primary = false,
}: {
  value: number | null;
  label: string;
  display?: string;
  onUse: UseValue;
  primary?: boolean;
}) {
  const ready = value !== null && Number.isFinite(value);
  const readable = display ?? (value === null ? "—" : formatNumber(value));
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => onUse(value, text, readable)}
      className={buttonClass(primary ? "primary" : "secondary", "compact")}
    >
      <span>{text}</span>
      <span
        className={`rounded-sm px-1 font-mono tabular-nums ${
          primary ? "bg-primary-active text-on-primary" : "bg-surface-sunken text-ink"
        }`}
      >
        {readable}
      </span>
      <span>{messages.financials.projectMath.toCalculator}</span>
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className={label}>{children}</span>;
}

export function Chart({
  title,
  caption,
  label: description,
  periods,
  children,
}: {
  title: string;
  caption: string;
  label: string;
  periods: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        <span className="font-mono text-[0.6875rem] text-ink-muted">{caption}</span>
      </div>
      <div
        role="img"
        aria-label={description}
        className="flex h-24 rounded-sm border border-line bg-surface-sunken p-2"
      >
        <div className="relative flex h-full flex-1 gap-1">{children}</div>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex gap-1 px-2 font-mono text-[0.5625rem] text-ink-muted"
      >
        {Array.from({ length: periods }, (_, index) => (
          <span key={index} className="flex-1 text-center">
            {messages.financials.projectMath.periodShort(index + 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RemoveRowButton({
  label: text,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className={buttonClass("ghost", "compact")}
      onClick={onClick}
      aria-label={text}
      disabled={disabled}
    >
      <span aria-hidden="true">✕</span>
    </button>
  );
}

export function useRowList<Row extends { id: number }>(seed: Row[]) {
  const [rows, setRows] = useState(seed);
  const nextId = useRef(Math.max(0, ...seed.map((row) => row.id)) + 1);
  return {
    rows,
    update: (id: number, patch: Partial<Omit<Row, "id">>) =>
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    add: (row: Omit<Row, "id">) => {
      const id = nextId.current++;
      setRows((current) => [...current, { ...row, id } as Row]);
    },
    remove: (id: number) => setRows((current) => current.filter((row) => row.id !== id)),
  };
}
