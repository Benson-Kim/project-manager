"use client";

import { useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { AnchoredPanel } from "@/components/ui/dialog";
import { panelPosition, type PanelPosition } from "@/components/ui/data-view/datasheet";
import { messages } from "@/lib/messages";
import { evaluateExpression, MAX_EXPRESSION_LENGTH, toSumText } from "../calc/expression";

const M = messages.financials.quickCalculator;
const SIZE = { minWidth: 288, minBelow: 360 };
const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "x", "1", "2", "3", "-", "0", ".", "%", "+"];
const shown = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

/**
 * An everyday calculator over the financials pages. It never blocks the page:
 * clicking elsewhere leaves it open so figures can be read off the sheet, and
 * only its close button, Escape or the header button shut it. The sum stays
 * while it is closed. Enter or = replaces the sum with its answer.
 */
export function QuickCalculator() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [sum, setSum] = useState("");
  const result = evaluateExpression(sum);

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      panelPosition(rect, { width: window.innerWidth, height: window.innerHeight }, SIZE),
    );
  }

  function close() {
    setPosition(null);
    buttonRef.current?.focus();
  }

  function type(key: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? sum.length;
    const end = input?.selectionEnd ?? sum.length;
    const next = (sum.slice(0, start) + key + sum.slice(end)).slice(0, MAX_EXPRESSION_LENGTH);
    setSum(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + key.length, start + key.length);
    });
  }

  function equals() {
    if (result.ok) setSum(toSumText(result.value));
    inputRef.current?.focus();
  }

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
          <input
            ref={inputRef}
            aria-label={M.sum}
            value={sum}
            maxLength={MAX_EXPRESSION_LENGTH}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setSum(event.target.value)}
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
              ? M.result(shown.format(result.value))
              : result.error === "empty"
                ? null
                : M[result.error]}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {KEYS.map((key) => (
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
              onClick={() => {
                setSum("");
                inputRef.current?.focus();
              }}
              className={buttonClass("ghost")}
            >
              {M.clear}
            </button>
            <button
              type="button"
              aria-label={M.equals}
              onClick={equals}
              className={buttonClass("primary")}
            >
              =
            </button>
          </div>
          <button type="button" onClick={close} className={`${buttonClass("ghost")} self-end`}>
            {M.close}
          </button>
        </AnchoredPanel>
      ) : null}
    </>
  );
}
