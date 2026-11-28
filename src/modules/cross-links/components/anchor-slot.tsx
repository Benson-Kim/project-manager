"use client";

import Link from "next/link";
import { messages } from "@/lib/messages";
import type { CrossLinkEndpointDto } from "../schemas/cross-link";
import { rowAnchorIdentity, type CrossLinkAnchorKind } from "../schemas/location";
import { STICKY_COLOR_STYLES } from "./color-tokens";
import { useCrossLinkMenu } from "./context-menu-bridge";

const RETURN_HOP_KEY = "pm:cross-link-return:v1";

export function rememberCrossLinkReturnHop(from: CrossLinkEndpointDto, to: CrossLinkEndpointDto) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      RETURN_HOP_KEY,
      JSON.stringify({
        returnHref: from.href,
        returnLabel: from.label,
        targetHref: to.href.split("#")[0],
        savedAtMs: Date.now(),
      }),
    );
  } catch {
    // Ignore storage issues.
  }
}

export function consumeCrossLinkReturnHop(currentPathname: string): {
  returnHref: string;
  returnLabel: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RETURN_HOP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      returnHref?: unknown;
      returnLabel?: unknown;
      targetHref?: unknown;
      savedAtMs?: unknown;
    };
    if (
      typeof parsed.returnHref !== "string" ||
      !parsed.returnHref.startsWith("/") ||
      parsed.returnHref.startsWith("//") ||
      typeof parsed.returnLabel !== "string" ||
      typeof parsed.savedAtMs !== "number" ||
      Date.now() - parsed.savedAtMs > 10 * 60_000
    ) {
      window.sessionStorage.removeItem(RETURN_HOP_KEY);
      return null;
    }
    if (
      typeof parsed.targetHref === "string" &&
      parsed.targetHref.split("?")[0] !== currentPathname
    ) {
      return null;
    }
    return { returnHref: parsed.returnHref, returnLabel: parsed.returnLabel };
  } catch {
    return null;
  }
}

export interface AnchorSlotProps {
  anchorKind?: CrossLinkAnchorKind;
  anchorKey: string;
  entityId?: number | null;
  subEntityId?: number | null;
  className?: string;
}

/**
 * Inline badge container rendered inside mounted records, Kanban cards, WBS nodes, etc.
 * Marks [data-cl-slot-key] in the DOM so PageStickiesStrip promotes any off-page, paginated,
 * or collapsed anchors automatically instead of hiding them.
 */
export function AnchorSlot({
  anchorKind = "record",
  anchorKey,
  entityId = null,
  subEntityId = null,
  className = "",
}: AnchorSlotProps) {
  const ctx = useCrossLinkMenu();

  if (!ctx) return null;

  // A row anchor is stored the way capture stored it: on a rows-are-subentities module that
  // is the page's entity plus the row in SubEntityId, not the row as the entity.
  const wanted = ctx.location
    ? rowAnchorIdentity(
        ctx.location.moduleKey,
        anchorKind,
        entityId,
        ctx.location.entityId,
        subEntityId,
      )
    : { entityId, subEntityId };

  const matchingLinks = ctx.links.filter((link) => {
    if (link.here.anchorKey !== anchorKey) return false;
    if (wanted.entityId !== null && link.here.entityId !== wanted.entityId) return false;
    if (wanted.subEntityId !== null && link.here.subEntityId !== wanted.subEntityId) return false;
    return true;
  });

  const matchingNotes = ctx.notes.filter((note) => {
    if (note.anchorKey !== anchorKey) return false;
    if (wanted.entityId !== null && note.entityId !== wanted.entityId) return false;
    if (wanted.subEntityId !== null && note.subEntityId !== wanted.subEntityId) return false;
    return true;
  });

  const empty = matchingLinks.length === 0 && matchingNotes.length === 0;

  return (
    <span
      data-cl-slot-key={anchorKey}
      className={
        empty
          ? "hidden"
          : `inline-flex max-w-full flex-wrap items-center gap-1 print:hidden ${className}`
      }
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {matchingLinks.map((link) => {
        const tone = STICKY_COLOR_STYLES[link.color];
        return (
          <span
            key={`cl-${link.crossLinkId}-${link.side}`}
            data-testid={`cross-link-chip-${link.crossLinkId}`}
            className={`inline-flex max-w-56 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight ${tone.chipClass}`}
          >
            <Link
              href={link.there.href}
              onClick={() => rememberCrossLinkReturnHop(link.here, link.there)}
              className="truncate hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
              title={`${link.linkTitle} — ${messages.crossLinks.targetPrefix} ${link.there.label}`}
            >
              ↗ {link.linkTitle}
            </Link>
            <button
              type="button"
              onClick={() => ctx.openEditCrossLink(link)}
              aria-label={`${messages.crossLinks.editAction} ${link.linkTitle}`}
              className="shrink-0 rounded-full px-1 text-[10px] opacity-75 hover:opacity-100"
            >
              ···
            </button>
          </span>
        );
      })}
      {matchingNotes.map((note) => {
        const tone = STICKY_COLOR_STYLES[note.color];
        return (
          <button
            key={`pn-${note.pageNoteId}`}
            type="button"
            data-testid={`page-note-chip-${note.pageNoteId}`}
            onClick={() => ctx.openEditPageNote(note)}
            className={`inline-flex max-w-52 items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-tight hover:opacity-95 ${tone.chipClass}`}
            title={note.body}
          >
            <span className="truncate">{note.body}</span>
          </button>
        );
      })}
    </span>
  );
}
