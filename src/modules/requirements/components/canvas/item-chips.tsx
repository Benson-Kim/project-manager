import { messages } from "@/lib/messages";
import { TONES } from "@/components/ui/tones";
import type { CanvasGaps } from "../../canvas/gaps";
import type { CanvasItem } from "../../schemas/canvas";
import { typeLabel } from "../../schemas/requirement-types";
import { TYPE_TONES } from "../requirement-chips";

const M = messages.requirements.canvas;

export const chip = "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium";

/**
 * Join a item's type and reference into one token, e.g. "FR-1.1" -> "FR1.1". A requirement's Ref
 * already starts with its type and a dash; a WBS code carries no type, so the type is prefixed.
 */
export function badgeLabel(type: CanvasItem["Type"], refLabel: string): string {
  const prefix = `${type}-`;
  const tail = refLabel.startsWith(prefix) ? refLabel.slice(prefix.length) : refLabel;
  return tail ? `${type}${tail}` : type;
}

export function ItemBadge({ type, refLabel }: { type: CanvasItem["Type"]; refLabel: string }) {
  const label = badgeLabel(type, refLabel);
  if (type === "WBS") {
    return <span className={`${chip} border-line bg-surface-raised text-ink`}>{label}</span>;
  }
  return (
    <span
      title={typeLabel(type)}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${TONES[TYPE_TONES[type]].badge}`}
    >
      {label}
    </span>
  );
}

export function GapChips({ gap }: { gap: CanvasGaps | undefined }) {
  return (
    <>
      {gap?.missingTest ? (
        <span className={`${chip} border-danger bg-danger-soft text-danger`}>{M.missingTest}</span>
      ) : null}
      {gap?.noDownstream ? (
        <span className={`${chip} border-warning bg-warning-soft text-warning`}>
          {M.noDownstream}
        </span>
      ) : null}
    </>
  );
}
