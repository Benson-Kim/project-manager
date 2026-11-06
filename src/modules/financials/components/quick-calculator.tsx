"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { z } from "zod";
import { buttonClass } from "@/components/ui/button-styles";
import { AnchoredPanel } from "@/components/ui/dialog";
import { panelPosition, type PanelPosition } from "@/components/ui/data-view/datasheet";
import { messages } from "@/lib/messages";
import {
  addToTape,
  evaluateExpression,
  KEYPAD,
  MAX_EXPRESSION_LENGTH,
  MAX_TAPE,
  PAGE_KEY_LABELS,
  SCIENTIFIC_PAGES,
  sumAfterEquals,
  sumAfterKey,
  toggleSign,
  toShownText,
  toSumText,
  type AngleUnit,
  type TapeEntry,
} from "../calc/expression";

const M = messages.financials.quickCalculator;
const SIZE = { minWidth: 336, minBelow: 600 };
const STORE_KEY = "pm.quickCalculator";
const TYPED_KEYS = /^[\d.+\-*/^%()!,]$/;

const storedSchema = z.object({
  angle: z.enum(["deg", "rad"]),
  memory: z.number().finite(),
  tape: z
    .array(z.object({ sum: z.string().max(MAX_EXPRESSION_LENGTH), value: z.number().finite() }))
    .max(MAX_TAPE),
});
type Stored = z.infer<typeof storedSchema>;

function readStored(): Stored | null {
  try {
    const parsed = storedSchema.safeParse(JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface QuickCalculatorHandle {
  /** Opens the panel and types the value into the sum, as a key would. */
  enter(value: number): void;
}

/**
 * An everyday calculator over the financials pages. It never blocks the page:
 * clicking elsewhere leaves it open so figures can be read off the sheet, and
 * only its close button, Escape or the header button shut it. The sum stays
 * while it is closed. Enter or = replaces the sum with its answer, which also
 * becomes Ans and goes on the tape. The angle unit, memory and tape are kept in
 * this browser only.
 */
export function QuickCalculator({ ref }: { ref?: Ref<QuickCalculatorHandle> }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [sum, setSum] = useState("");
  const [scientific, setScientific] = useState(false);
  const [page, setPage] = useState(0);
  const [angle, setAngle] = useState<AngleUnit>("deg");
  const [memory, setMemory] = useState(0);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [ans, setAns] = useState(0);
  const [afterEquals, setAfterEquals] = useState(false);
  const result = evaluateExpression(sum, { angle, ans });

  useEffect(() => {
    if (loaded.current) writeStored({ angle, memory, tape });
  }, [angle, memory, tape]);

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!loaded.current) {
      loaded.current = true;
      const stored = readStored();
      if (stored) {
        setAngle(stored.angle);
        setMemory(stored.memory);
        setTape(stored.tape);
      }
    }
    setPosition(
      panelPosition(rect, { width: window.innerWidth, height: window.innerHeight }, SIZE),
    );
  }

  function close() {
    setPosition(null);
    buttonRef.current?.focus();
  }

  function focusAt(caret: number) {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  function replace(next: string, caret: number) {
    setSum(next);
    setAfterEquals(false);
    focusAt(caret);
  }

  function type(key: string) {
    const carried = sumAfterKey(sum, key, afterEquals);
    if (carried !== null) return replace(carried, carried.length);
    const start = inputRef.current?.selectionStart ?? sum.length;
    const end = inputRef.current?.selectionEnd ?? sum.length;
    const next = (sum.slice(0, start) + key + sum.slice(end)).slice(0, MAX_EXPRESSION_LENGTH);
    replace(next, Math.min(start + key.length, next.length));
  }

  function backspace() {
    const start = inputRef.current?.selectionStart ?? sum.length;
    const end = inputRef.current?.selectionEnd ?? sum.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    replace(sum.slice(0, from) + sum.slice(end), from);
  }

  function equals() {
    if (result.ok) {
      setTape(addToTape(tape, { sum: sum.trim(), value: result.value }));
      setAns(result.value);
      setSum(sumAfterEquals(sum, result.value));
      setAfterEquals(true);
    }
    inputRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({
    enter(value) {
      if (!position) open();
      type(toSumText(value));
    },
  }));

  function shownValue() {
    return result.ok ? result.value : ans;
  }

  function onPanelKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target === inputRef.current || event.ctrlKey || event.metaKey || event.altKey) return;
    if (TYPED_KEYS.test(event.key)) type(event.key);
    else if (event.key === "Enter" || event.key === "=") equals();
    else if (event.key === "Backspace") backspace();
    else return;
    event.preventDefault();
  }

  const nextPage = (page + 1) % SCIENTIFIC_PAGES.length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={position !== null}
        data-testid="quick-calculator"
        onClick={() => (position ? close() : open())}
        className={buttonClass("secondary")}
      >
        {M.open}
      </button>
      {position ? (
        <AnchoredPanel
          open
          title={M.open}
          style={{ ...position }}
          testId="quick-calculator-panel"
          onEscape={close}
          onOutside={() => {}}
        >
          <div className="contents" onKeyDown={onPanelKey}>
            <input
              ref={inputRef}
              aria-label={M.sum}
              value={sum}
              maxLength={MAX_EXPRESSION_LENGTH}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setSum(event.target.value);
                setAfterEquals(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                equals();
              }}
              className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-right text-lg text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-coral"
            />
            <p
              role="status"
              data-testid="quick-calculator-result"
              className={`min-h-6 text-right text-sm tabular-nums ${result.ok ? "text-ink" : "text-ink-muted"}`}
            >
              {result.ok
                ? M.result(toShownText(result.value))
                : result.error === "empty"
                  ? null
                  : M[result.error]}
            </p>
            <p className="flex justify-end gap-3 text-xs text-ink-muted tabular-nums">
              {memory !== 0 ? (
                <span data-testid="quick-calculator-memory">
                  {M.memory.shown(toShownText(memory))}
                </span>
              ) : null}
              <span>{M.ansShown(toShownText(ans))}</span>
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                aria-label={M.ansName}
                onClick={() => type("ans")}
                className={buttonClass("secondary", "compact")}
              >
                {M.ans}
              </button>
              <button
                type="button"
                aria-label={M.memory.clear}
                onClick={() => setMemory(0)}
                className={buttonClass("secondary", "compact")}
              >
                MC
              </button>
              <button
                type="button"
                aria-label={M.memory.recall}
                onClick={() => type(toSumText(memory))}
                className={buttonClass("secondary", "compact")}
              >
                MR
              </button>
              <button
                type="button"
                aria-label={M.memory.add}
                onClick={() => setMemory(memory + shownValue())}
                className={buttonClass("secondary", "compact")}
              >
                M+
              </button>
              <button
                type="button"
                aria-label={M.memory.subtract}
                onClick={() => setMemory(memory - shownValue())}
                className={buttonClass("secondary", "compact")}
              >
                M−
              </button>
            </div>
            <button
              type="button"
              aria-pressed={scientific}
              onClick={() => setScientific(!scientific)}
              className={`${buttonClass("secondary", "compact")} self-start aria-pressed:bg-surface-raised`}
            >
              {M.scientific}
            </button>
            {scientific ? (
              <>
                <div data-testid="quick-calculator-scientific" className="grid grid-cols-4 gap-1.5">
                  {SCIENTIFIC_PAGES[page].map((key) => (
                    <button
                      key={key.id}
                      type="button"
                      aria-label={M.keys[key.id]}
                      onClick={() => type(key.insert)}
                      className={buttonClass("secondary")}
                    >
                      {key.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={M.angle[angle].name}
                    onClick={() => setAngle(angle === "deg" ? "rad" : "deg")}
                    className={buttonClass("ghost")}
                  >
                    {M.angle[angle].label}
                  </button>
                  <button
                    type="button"
                    aria-label={M.pageKey(nextPage + 1)}
                    aria-pressed={page > 0}
                    onClick={() => setPage(nextPage)}
                    className={`${buttonClass("ghost")} aria-pressed:bg-surface-raised`}
                  >
                    {PAGE_KEY_LABELS[page]}
                  </button>
                </div>
                <p className="text-xs text-ink-muted">{M.pages[page]}</p>
              </>
            ) : null}
            <div className="grid grid-cols-4 gap-1.5">
              {KEYPAD.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => type(key)}
                  className={`${buttonClass("secondary")} tabular-nums`}
                >
                  {key}
                </button>
              ))}
              <button type="button" onClick={() => type("(")} className={buttonClass("secondary")}>
                (
              </button>
              <button type="button" onClick={() => type(")")} className={buttonClass("secondary")}>
                )
              </button>
              <button
                type="button"
                aria-label={M.sign}
                onClick={() => {
                  const next = toggleSign(afterEquals ? toSumText(ans) : sum);
                  replace(next, next.length);
                }}
                className={buttonClass("secondary")}
              >
                ±
              </button>
              <button
                type="button"
                aria-label={M.backspace}
                onClick={backspace}
                className={buttonClass("secondary")}
              >
                ⌫
              </button>
              <button
                type="button"
                onClick={() => replace("", 0)}
                className={`${buttonClass("ghost")} col-span-2`}
              >
                {M.clear}
              </button>
              <button
                type="button"
                aria-label={M.equals}
                onClick={equals}
                className={`${buttonClass("primary")} col-span-2`}
              >
                =
              </button>
            </div>
            <section aria-label={M.tape} className="flex flex-col gap-1 border-t border-line pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-ink">{M.tape}</span>
                {tape.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTape([])}
                    className={buttonClass("ghost", "compact")}
                  >
                    {M.tapeClear}
                  </button>
                ) : null}
              </div>
              {tape.length === 0 ? (
                <p className="text-xs text-ink-muted">{M.tapeEmpty}</p>
              ) : (
                <ol data-testid="quick-calculator-tape" className="max-h-32 overflow-y-auto">
                  {tape.map((entry, index) => (
                    <li key={`${index}-${entry.sum}`}>
                      <button
                        type="button"
                        aria-label={M.tapeLoad(entry.sum)}
                        onClick={() => replace(entry.sum, entry.sum.length)}
                        className="block w-full rounded-md px-2 py-1 text-right hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-coral"
                      >
                        <span className="block truncate text-xs text-ink-muted">{entry.sum}</span>
                        <span className="block text-sm text-ink tabular-nums">
                          {M.result(toShownText(entry.value))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <p className="text-xs text-ink-muted">{M.hints}</p>
            <button type="button" onClick={close} className={`${buttonClass("ghost")} self-end`}>
              {M.close}
            </button>
          </div>
        </AnchoredPanel>
      ) : null}
    </>
  );
}
