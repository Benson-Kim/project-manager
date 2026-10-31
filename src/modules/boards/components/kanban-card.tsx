"use client";
import { useLookupLists } from "@/components/ui/lookup-lists";
import { TONES } from "@/components/ui/tones";
import { formatDate } from "@/lib/format";
import { optionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { MOSCOW_TONES, TypeBadge } from "@/modules/requirements/components/requirement-chips";
import { moscowLabel } from "@/modules/requirements/schemas/moscow";
import type { BoardCardListRow } from "../schemas/board-card";
import { cardHealth, cardKind, type MoscowCount, type Tally } from "../schemas/board-kanban";

const M = messages.boards;
const K = M.kanban;

const tag =
  "inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold";

function livePriority(card: BoardCardListRow): string | null {
  return card.DeliverableState === "live" ? card.DeliverablePriority : null;
}

/** A plain card with no priority has no tags row; its menu sits beside the title instead. */
export function hasCardTags(card: BoardCardListRow): boolean {
  return cardKind(card) !== "free" || livePriority(card) !== null;
}

function CardTags({ card, menu }: { card: BoardCardListRow; menu?: React.ReactNode }) {
  const { lists } = useLookupLists();
  const kind = cardKind(card);
  const priority = livePriority(card);
  const tone = optionColor(lists["key-deliverable.priority"], priority);
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {kind === "requirement" && card.RequirementState === "live" && card.RequirementType ? (
          <>
            <TypeBadge type={card.RequirementType} />
            <span className="text-xs text-ink-muted">
              {card.RequirementRef ?? `${card.RequirementType}-${card.RequirementNumber}`}
            </span>
          </>
        ) : kind !== "free" ? (
          <span className={`${tag} border-transparent bg-level-2 text-level-ink`}>
            {K.kinds[kind]}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {priority ? (
          <span
            title={K.priority(priority)}
            className={`${tag} ${tone ? TONES[tone].badge : "border-line text-ink-muted"}`}
          >
            {priority}
          </span>
        ) : null}
        {menu}
      </span>
    </div>
  );
}

function MoscowCountPill({ code, count }: MoscowCount) {
  const label = K.moscowCount(count, moscowLabel(code));
  return (
    <span title={label} aria-label={label} className={`${tag} ${TONES[MOSCOW_TONES[code]].badge}`}>
      {code}:{count}
    </span>
  );
}

function TallyText({ label, tally }: { label: string; tally: Tally }) {
  const done = tally.total > 0 && tally.done === tally.total;
  return (
    <span>
      {label}:{" "}
      <b className={done ? "text-tone-green-ink" : "text-ink"}>
        {tally.done}/{tally.total}
      </b>
    </span>
  );
}

/** What a card says under its title; the caller supplies the grip, the title button and the menu. */
export function KanbanCardBody({
  card,
  assignee,
}: {
  card: BoardCardListRow;
  assignee: string | null;
}) {
  const health = cardHealth(card);
  const description = card.Title && card.RequirementState === "live" ? card.RequirementText : null;
  const window =
    card.DeliverableState === "live" && (card.DeliverableStartDate || card.DeliverableDeadline)
      ? `${formatDate(card.DeliverableStartDate) || "…"} – ${formatDate(card.DeliverableDeadline) || "…"}`
      : null;
  return (
    <>
      {card.RequirementState === "restricted" || card.DeliverableState === "restricted" ? (
        <p className="text-xs text-ink-muted">{M.restrictedCard}</p>
      ) : card.RequirementState === "removed" ? (
        <p className="text-xs text-ink-muted">{M.removedCard}</p>
      ) : card.DeliverableState === "removed" ? (
        <p className="text-xs text-ink-muted">{M.removedDeliverable}</p>
      ) : null}
      {description ? (
        <p className="line-clamp-2 text-[11px] leading-snug text-ink-muted">{description}</p>
      ) : null}
      {window ? <p className="text-xs text-ink-muted">{window}</p> : null}
      {health.moscow.length ? (
        <div role="group" className="flex flex-wrap gap-1" aria-label={K.moscowPresent}>
          {health.moscow.map((pill) => (
            <MoscowCountPill key={pill.code} {...pill} />
          ))}
        </div>
      ) : null}
      {assignee || card.DueDate || card.StoryPoints !== null ? (
        <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
          {assignee ? <span>{assignee}</span> : null}
          {card.DueDate ? <time>{formatDate(card.DueDate)}</time> : null}
          {card.StoryPoints !== null ? (
            <span>
              {card.StoryPoints} {M.ui.points}
            </span>
          ) : null}
        </div>
      ) : null}
      {health.must || health.met ? (
        <div className="mt-1 flex justify-between gap-2 border-t border-line pt-2 text-[11px] text-ink-muted">
          {health.must ? <TallyText label={K.mustHaves} tally={health.must} /> : <span />}
          {health.met ? (
            <b className="text-ink">{K.done(health.met.done, health.met.total)}</b>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Shown on hover or focus where a pointer can hover; always on a touch screen. */
export const kanbanReveal =
  "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

export function kanbanCardClass(dragging: boolean): string {
  return `group/card relative flex flex-col gap-1.5 rounded-xl border bg-surface p-3 transition-colors ${
    dragging
      ? "border-dashed border-ink-muted bg-surface-raised opacity-40"
      : "border-line hover:border-coral focus-within:border-coral"
  }`;
}

export { CardTags as KanbanCardTags };
