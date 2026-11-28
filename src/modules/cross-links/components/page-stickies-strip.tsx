"use client";

import Link from "next/link";
import { useState } from "react";
import { messages } from "@/lib/messages";
import type { CrossLinkItem } from "../schemas/cross-link";
import type { PageNoteItem } from "../schemas/page-note";
import { rememberCrossLinkReturnHop } from "./anchor-slot";
import { STICKY_COLOR_STYLES } from "./color-tokens";
import { useCrossLinkMenu } from "./context-menu-bridge";

const PERSONAL_NOTE_MODULES = new Set(["dashboard", "reports"]);

function isPersonalStickyNote(note: PageNoteItem): boolean {
  if (PERSONAL_NOTE_MODULES.has(note.moduleKey)) return true;
  if (
    (note.moduleKey === "todo" || note.moduleKey === "daily-activity") &&
    note.projectId === null &&
    note.entityId === null
  ) {
    return true;
  }
  return false;
}

export function PageStickiesStrip({
  mountedAnchorKeys,
  arrivalReturn,
  onDismissArrivalReturn,
}: {
  mountedAnchorKeys: ReadonlySet<string>;
  arrivalReturn: { returnHref: string; returnLabel: string } | null;
  onDismissArrivalReturn: () => void;
}) {
  const ctx = useCrossLinkMenu();
  const [collapsed, setCollapsed] = useState(false);

  if (!ctx || !ctx.location) return null;

  // Deduplicate identical same-location links when neither side has a mounted slot.
  const visibleLinks: CrossLinkItem[] = [];
  const seenSameStripIds = new Set<number>();
  for (const link of ctx.links) {
    const key = link.here.anchorKey;
    if (key && mountedAnchorKeys.has(key)) continue;
    if (seenSameStripIds.has(link.crossLinkId)) continue;
    if (
      link.endA.moduleKey === link.endB.moduleKey &&
      (link.endA.projectId ?? null) === (link.endB.projectId ?? null) &&
      (link.endA.entityId ?? null) === (link.endB.entityId ?? null) &&
      !(link.endA.anchorKey && mountedAnchorKeys.has(link.endA.anchorKey)) &&
      !(link.endB.anchorKey && mountedAnchorKeys.has(link.endB.anchorKey))
    ) {
      seenSameStripIds.add(link.crossLinkId);
    }
    visibleLinks.push(link);
  }

  const visibleNotes: PageNoteItem[] = ctx.notes.filter((note) => {
    const key = note.anchorKey;
    return !(key && mountedAnchorKeys.has(key));
  });

  if (visibleLinks.length === 0 && visibleNotes.length === 0 && !arrivalReturn) {
    return null;
  }

  return (
    <section
      aria-label={messages.crossLinks.stripHeading}
      data-testid="page-stickies-strip"
      className="mb-3 rounded-lg border border-line bg-surface-raised/85 px-3 py-2 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {messages.crossLinks.stripHeading}
          </h2>
          {arrivalReturn ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-focus/40 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
              <Link
                href={arrivalReturn.returnHref}
                data-testid="cross-link-return-link"
                className="hover:underline"
              >
                ← {messages.crossLinks.returnToPair(arrivalReturn.returnLabel)}
              </Link>
              <button
                type="button"
                aria-label={messages.actions.close}
                onClick={onDismissArrivalReturn}
                className="rounded-full px-1 text-[11px] hover:bg-hover"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
        {visibleLinks.length > 0 || visibleNotes.length > 0 ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-2 py-0.5 text-xs text-ink-muted hover:bg-hover hover:text-ink"
          >
            {collapsed
              ? `${messages.crossLinks.stripExpand} (${visibleLinks.length + visibleNotes.length})`
              : messages.crossLinks.stripCollapse}
          </button>
        ) : null}
      </div>

      {!collapsed && (visibleLinks.length > 0 || visibleNotes.length > 0) ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleNotes.map((note) => {
            const tone = STICKY_COLOR_STYLES[note.color];
            const isPersonal = isPersonalStickyNote(note);
            const hasOnTag = note.anchorKind !== "page" && Boolean(note.anchorLabel);
            return (
              <article
                key={`strip-pn-${note.pageNoteId}`}
                data-testid={`strip-page-note-${note.pageNoteId}`}
                className={`flex min-w-0 flex-col justify-between gap-2 rounded-md border p-2.5 text-xs shadow-xs ${tone.surfaceClass}`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">{messages.crossLinks.noteBadgeLabel}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {hasOnTag ? (
                        <span className="max-w-36 truncate rounded bg-surface/60 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                          {messages.crossLinks.onTargetPrefix} {note.anchorLabel}
                        </span>
                      ) : null}
                      {isPersonal ? (
                        <span className="rounded bg-surface/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                          {messages.crossLinks.privateNoteTag}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug text-ink">
                    {note.body}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => ctx.openEditPageNote(note)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface/60"
                  >
                    {messages.crossLinks.editAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => ctx.openDeletePageNote(note)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-surface/60"
                  >
                    {messages.crossLinks.deleteAction}
                  </button>
                </div>
              </article>
            );
          })}

          {visibleLinks.map((link) => {
            const tone = STICKY_COLOR_STYLES[link.color];
            const showHereTag = link.here.anchorKind !== "page";
            return (
              <article
                key={`strip-cl-${link.crossLinkId}-${link.side}`}
                data-testid={`strip-cross-link-${link.crossLinkId}`}
                className={`flex min-w-0 flex-col justify-between gap-2 rounded-md border p-2.5 text-xs shadow-xs ${tone.surfaceClass}`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">{messages.crossLinks.linkedBadgeLabel}</span>
                    {showHereTag ? (
                      <span className="max-w-36 truncate rounded bg-surface/60 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                        {messages.crossLinks.onTargetPrefix} {link.here.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm font-semibold text-ink">{link.linkTitle}</p>
                  {link.noteText ? (
                    <p className="whitespace-pre-wrap break-words text-xs text-ink-muted">
                      {link.noteText}
                    </p>
                  ) : null}
                  <Link
                    href={link.there.href}
                    onClick={() => rememberCrossLinkReturnHop(link.here, link.there)}
                    data-testid={`strip-cross-link-jump-${link.crossLinkId}`}
                    className="inline-flex max-w-full items-center gap-1 rounded bg-surface/75 px-2 py-1 text-xs font-medium text-accent-strong hover:underline"
                  >
                    <span className="truncate">
                      ↗ {messages.crossLinks.targetPrefix}: {link.there.label}
                    </span>
                  </Link>
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => ctx.openEditCrossLink(link)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface/60"
                  >
                    {messages.crossLinks.editAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => ctx.openDeleteCrossLink(link)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-surface/60"
                  >
                    {messages.crossLinks.deleteAction}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
