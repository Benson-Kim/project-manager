"use client";

import { createContext, useContext } from "react";
import type { CrossLinkItem } from "../schemas/cross-link";
import type { LocationAnchor } from "../schemas/location";
import type { PageNoteItem } from "../schemas/page-note";
import type { EndpointWithLabel } from "../schemas/cross-link";
import type { PendingCrossLinkSource } from "./pending-link-storage";

export interface CrossLinkMenuContextValue {
  location: LocationAnchor | null;
  pageLabel: string;
  pendingSource: PendingCrossLinkSource | null;
  links: CrossLinkItem[];
  notes: PageNoteItem[];
  loading: boolean;
  currentUserId: number | null;
  openAddPageNote: (endpoint?: EndpointWithLabel | null) => void;
  startCrossLink: (endpoint?: EndpointWithLabel | null) => void;
  completeCrossLink: (endpoint?: EndpointWithLabel | null) => void;
  cancelPendingCrossLink: () => void;
  openEditCrossLink: (link: CrossLinkItem) => void;
  openDeleteCrossLink: (link: CrossLinkItem) => void;
  openEditPageNote: (note: PageNoteItem) => void;
  openDeletePageNote: (note: PageNoteItem) => void;
  refresh: () => void;
}

export const CrossLinkMenuContext = createContext<CrossLinkMenuContextValue | null>(null);

export function useCrossLinkMenu(): CrossLinkMenuContextValue | null {
  return useContext(CrossLinkMenuContext);
}
