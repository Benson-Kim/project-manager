"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { messages } from "@/lib/messages";
import { CollapseIcon } from "./shell-icons";
import {
  applySidebar,
  isSidebarApplied,
  isSidebarKey,
  saveSidebar,
  shownSidebar,
  storedSidebar,
  sidebarStateOf,
  type SidebarState,
} from "./sidebar-state";

let listeners: Array<() => void> = [];

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (!isSidebarKey(event.key) && event.key !== null) return;
  applySidebar(event.key === null ? "expanded" : sidebarStateOf(event.newValue));
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  if (listeners.length === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
    if (listeners.length === 0) window.removeEventListener("storage", onStorage);
  };
}

/**
 * The sidebar's state as an external store over html[data-sidebar]: the server
 * snapshot is "expanded", the client re-syncs after hydration (no mismatch), and
 * another window of the app changing it is followed through the storage event.
 */
export function useSidebar(): { collapsed: boolean; toggle: () => void } {
  const state = useSyncExternalStore<SidebarState>(subscribe, shownSidebar, () => "expanded");

  useEffect(() => {
    if (isSidebarApplied()) return;
    applySidebar(storedSidebar());
    emit();
  }, []);

  const toggle = useCallback(() => {
    const next: SidebarState = shownSidebar() === "collapsed" ? "expanded" : "collapsed";
    applySidebar(next);
    saveSidebar(next);
    emit();
  }, []);

  return { collapsed: state === "collapsed", toggle };
}

export function SidebarToggle({
  controls,
  collapsed,
  onToggle,
}: {
  controls: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={messages.app.sidebarToggle}
      aria-expanded={!collapsed}
      aria-controls={controls}
      title={collapsed ? messages.app.expandSidebar : messages.app.collapseSidebar}
      data-testid="sidebar-toggle"
      className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken"
      onClick={onToggle}
    >
      <CollapseIcon />
    </button>
  );
}
