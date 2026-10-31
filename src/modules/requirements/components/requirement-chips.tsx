"use client";

import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { TONES } from "@/components/ui/tones";
import { MOSCOW, moscowLabel, type MoSCoW } from "../schemas/moscow";
import { typeLabel, type RequirementType } from "../schemas/requirement-types";

/** One colour per requirement kind, the same in every plan view, list and card. */
export const TYPE_TONES: Record<RequirementType, OptionColor> = {
  FR: "blue",
  NFR: "yellow",
  TR: "purple",
  BR: "gray",
  SR: "green",
};

export const MOSCOW_TONES: Record<MoSCoW, OptionColor> = {
  M: "red",
  S: "yellow",
  C: "green",
  W: "gray",
};

/** Choosing the code already set clears it back to "not prioritised". */
export function nextMoscow(current: MoSCoW | null, chosen: MoSCoW): MoSCoW | null {
  return current === chosen ? null : chosen;
}

const pill = "inline-flex items-center rounded-full border font-semibold leading-none";

export function TypeBadge({ type }: { type: RequirementType }) {
  return (
    <span
      title={typeLabel(type)}
      className={`${pill} px-1.5 py-0.5 text-[10px] ${TONES[TYPE_TONES[type]].badge}`}
    >
      {type}
    </span>
  );
}

export function MoscowBadge({ code }: { code: MoSCoW }) {
  return (
    <span
      title={moscowLabel(code)}
      aria-label={moscowLabel(code)}
      className={`${pill} size-5 justify-center text-[10px] ${TONES[MOSCOW_TONES[code]].badge}`}
    >
      {code}
    </span>
  );
}

/**
 * The four MoSCoW codes as toggle buttons; pressing the current one clears it. `label`
 * names the group for screen readers (e.g. the requirement's ref).
 */
export function MoscowButtons({
  value,
  onChange,
  label = messages.requirements.moscowTitle,
  disabled = false,
}: {
  value: MoSCoW | null;
  onChange: (next: MoSCoW | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex gap-1">
      {MOSCOW.map((code) => {
        const on = value === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={on}
            aria-label={moscowLabel(code)}
            title={moscowLabel(code)}
            disabled={disabled}
            onClick={() => onChange(nextMoscow(value, code))}
            className={`${pill} size-7 justify-center text-xs transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral disabled:opacity-50 ${on ? TONES[MOSCOW_TONES[code]].badge : "border-line bg-surface text-ink-muted hover:bg-surface-sunken"}`}
          >
            {code}
          </button>
        );
      })}
    </span>
  );
}
