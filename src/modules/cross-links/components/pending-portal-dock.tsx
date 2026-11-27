"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { searchGlobalAction } from "@/modules/search/actions";
import type { SearchHit } from "@/modules/search/schemas/search";
import {
  isSameEndpoint,
  parseLocationFromHref,
  type CrossLinkAnchorKind,
} from "../schemas/location";
import type { EndpointWithLabel } from "../schemas/cross-link";
import type { PendingCrossLinkSource } from "./pending-link-storage";

function hitToEndpoint(hit: SearchHit): EndpointWithLabel | null {
  const parsed = parseLocationFromHref(hit.href);
  if (!parsed) return null;
  const anchorKind: CrossLinkAnchorKind = parsed.entityId ? "record" : "page";
  const anchorKey = parsed.entityId ? `row:${parsed.entityId}` : null;
  return {
    ...parsed,
    anchorKind,
    anchorKey,
    label: hit.title.slice(0, 120),
  };
}

function PendingPortalDockBody({
  pendingSource,
  currentLocationEndpoint,
  onCompleteWithEndpoint,
  onCancel,
}: {
  pendingSource: PendingCrossLinkSource;
  currentLocationEndpoint: EndpointWithLabel | null;
  onCompleteWithEndpoint: (target: EndpointWithLabel) => void;
  onCancel: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const trimmed = query.trim();
  const visibleHits = trimmed.length >= 2 ? hits : [];

  useEffect(() => {
    if (!pickerOpen || trimmed.length < 2) return;
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchGlobalAction({ q: trimmed, topPerKind: 6 });
        if (!active) return;
        if (res.ok) {
          setHits(res.data.groups.flatMap((g) => g.hits));
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pickerOpen, trimmed]);

  const canCompleteHere =
    currentLocationEndpoint !== null && !isSameEndpoint(pendingSource, currentLocationEndpoint);

  return (
    <aside
      role="region"
      aria-label={messages.crossLinks.dockRegionLabel}
      data-testid="pending-cross-link-dock"
      className="fixed right-4 bottom-4 z-(--z-dialog) w-[min(23rem,calc(100vw-2rem))] rounded-lg border border-focus/50 bg-surface-raised p-3 shadow-xl print:hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
            {messages.crossLinks.dockTitle}
          </p>
          <p className="truncate text-sm font-medium text-ink" title={pendingSource.label}>
            {pendingSource.label}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          data-testid="pending-cross-link-cancel"
          onClick={onCancel}
        >
          {messages.crossLinks.dockCancel}
        </Button>
      </div>

      <p className="mt-1.5 text-xs text-ink-muted">{messages.crossLinks.dockInstruction}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {canCompleteHere && currentLocationEndpoint ? (
          <Button
            type="button"
            variant="primary"
            data-testid="pending-cross-link-complete-here"
            onClick={() => onCompleteWithEndpoint(currentLocationEndpoint)}
          >
            {messages.crossLinks.completeCrossLinkMenu}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
        >
          {messages.crossLinks.dockQuickPickToggle}
        </Button>
      </div>

      {pickerOpen ? (
        <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          <input
            type="search"
            value={query}
            autoFocus
            placeholder={messages.crossLinks.dockQuickPickPlaceholder}
            onChange={(e) => {
              const nextVal = e.target.value;
              setQuery(nextVal);
              if (nextVal.trim().length < 2) setHits([]);
            }}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-focus focus:outline-none"
          />
          {searching ? (
            <p className="text-xs text-ink-muted">…</p>
          ) : visibleHits.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {visibleHits.map((hit) => {
                const candidate = hitToEndpoint(hit);
                if (!candidate || isSameEndpoint(pendingSource, candidate)) return null;
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => onCompleteWithEndpoint(candidate)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-hover"
                    >
                      <span className="truncate font-medium text-ink">{hit.title}</span>
                      {hit.projectName ? (
                        <span className="shrink-0 text-[11px] text-ink-muted">
                          {hit.projectName}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export function PendingPortalDock({
  pendingSource,
  currentLocationEndpoint,
  onCompleteWithEndpoint,
  onCancel,
}: {
  pendingSource: PendingCrossLinkSource | null;
  currentLocationEndpoint: EndpointWithLabel | null;
  onCompleteWithEndpoint: (target: EndpointWithLabel) => void;
  onCancel: () => void;
}) {
  if (!pendingSource) return null;
  return (
    <PendingPortalDockBody
      key={pendingSource.startedAtIso}
      pendingSource={pendingSource}
      currentLocationEndpoint={currentLocationEndpoint}
      onCompleteWithEndpoint={onCompleteWithEndpoint}
      onCancel={onCancel}
    />
  );
}
