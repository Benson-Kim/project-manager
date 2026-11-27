import {
  CROSS_LINK_ANCHOR_KINDS,
  CROSS_LINK_MODULE_RULES,
  MAX_ENDPOINT_LABEL_LEN,
  isSameEndpoint,
  normalizeAnchorKey,
  parseLocationFromHref,
  type CrossLinkAnchorKind,
  type LocationAnchor,
} from "../schemas/location";
import { normalizePlainText, type EndpointWithLabel } from "../schemas/cross-link";
import type { PendingCrossLinkSource } from "./pending-link-storage";

function parsePositiveIntAttr(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

function clampLabel(raw: string, fallback: string): string {
  const normalized = normalizePlainText(raw.replace(/<[a-z!/][^>]*>/gi, " "), false);
  const base = normalized || fallback;
  return base.slice(0, MAX_ENDPOINT_LABEL_LEN);
}

/**
 * Reads default page-level entityId & label from [data-cl-page-entity] on workspace pages
 * whose primary item isn't always echoed in the URL query string (e.g., default BPMN diagram).
 */
export function readPageEntityFromDom(root: ParentNode | null | undefined): {
  entityId: number | null;
  label: string | null;
} {
  if (!root || typeof root.querySelector !== "function") {
    return { entityId: null, label: null };
  }
  const el = root.querySelector<HTMLElement>("[data-cl-page-entity]");
  if (!el) return { entityId: null, label: null };
  const entityId = parsePositiveIntAttr(el.dataset.clPageEntity);
  const label = el.dataset.clPageLabel ? clampLabel(el.dataset.clPageLabel, "") : null;
  return { entityId, label: label || null };
}

export function resolveFallbackPageLabel(
  mainEl: ParentNode | null | undefined,
  pageEntityLabel: string | null,
): string {
  if (pageEntityLabel) return pageEntityLabel;
  if (mainEl && typeof mainEl.querySelector === "function") {
    const h1 = mainEl.querySelector("h1");
    if (h1?.textContent) return clampLabel(h1.textContent, "Current page");
  }
  if (typeof document !== "undefined") {
    const title = document.title.replace(/\s+[—|-]\s+Project Manager$/i, "");
    if (title) return clampLabel(title, "Current page");
  }
  return "Current page";
}

/**
 * Resolves the exact semantic EndpointWithLabel for a right-click / Shift+F10 target.
 * Walks up to [data-cl-anchor] and never inspects CSS pixels or raw external URLs.
 */
export function resolveEndpointFromTarget(
  target: EventTarget | null,
  pathname: string,
  search: string,
  mainEl: ParentNode | null | undefined,
): EndpointWithLabel | null {
  const { entityId: pageEntityId, label: pageEntityLabel } = readPageEntityFromDom(mainEl);
  const base = parseLocationFromHref(pathname, search, pageEntityId);
  if (!base) return null;

  const el = target instanceof Element ? target : null;
  const anchorEl = el?.closest<HTMLElement>("[data-cl-anchor]") ?? null;
  if (!anchorEl) {
    return {
      ...base,
      label: resolveFallbackPageLabel(mainEl, pageEntityLabel),
    };
  }

  const rawKind = anchorEl.dataset.clAnchor as CrossLinkAnchorKind | undefined;
  const anchorKind: CrossLinkAnchorKind =
    rawKind && (CROSS_LINK_ANCHOR_KINDS as readonly string[]).includes(rawKind)
      ? rawKind
      : "record";

  const anchorKey = normalizeAnchorKey(anchorEl.dataset.clAnchorKey);
  const rule = CROSS_LINK_MODULE_RULES[base.moduleKey];
  const fallback = resolveFallbackPageLabel(mainEl, pageEntityLabel);
  const label = clampLabel(anchorEl.dataset.clAnchorLabel ?? fallback, fallback);

  if (rule.rowsAreSubEntities && anchorKind === "record" && anchorKey) {
    const rowId = parsePositiveIntAttr(anchorEl.dataset.clEntityId);
    if (!base.entityId || !rowId) return { ...base, label: fallback };
    return {
      moduleKey: base.moduleKey,
      projectId: base.projectId,
      entityId: base.entityId,
      subEntityId: rowId,
      anchorKind: "subrecord",
      anchorKey,
      label,
    };
  }

  const anchorEntity =
    rule.entity !== "null"
      ? (parsePositiveIntAttr(anchorEl.dataset.clEntityId) ?? base.entityId)
      : base.entityId;
  const anchorSub =
    rule.subEntity === "optional" && anchorEntity
      ? (parsePositiveIntAttr(anchorEl.dataset.clSubId) ?? base.subEntityId)
      : null;

  return {
    moduleKey: base.moduleKey,
    projectId: base.projectId,
    entityId: anchorEntity,
    subEntityId: anchorSub,
    anchorKind: anchorKey ? anchorKind : "page",
    anchorKey,
    label,
  };
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) {
    return true;
  }
  return false;
}

export function hasNonEmptySelection(): boolean {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") return false;
  const sel = window.getSelection();
  return Boolean(sel && sel.toString().trim().length > 0);
}

/**
 * Updates documentElement.dataset.pmContextMenu with the 4-field allowlisted snapshot
 * read synchronously by Electron's showContextMenu() when context-menu fires.
 */
export function writeElectronContextMenuHint(params: {
  location: LocationAnchor | null;
  endpoint: EndpointWithLabel | null;
  pending: PendingCrossLinkSource | null;
}): void {
  if (typeof document === "undefined") return;
  const { location, endpoint, pending } = params;
  const canAddNote = location !== null;
  const canAddLink = location !== null;
  const canCompleteLink =
    Boolean(pending) && endpoint !== null && !isSameEndpoint(pending as LocationAnchor, endpoint);
  const pendingLabel = pending && pending.label ? pending.label.slice(0, 40) : null;

  document.documentElement.dataset.pmContextMenu = JSON.stringify({
    canAddNote,
    canAddLink,
    canCompleteLink,
    pendingLabel,
  });
}

export function clearElectronContextMenuHint(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.pmContextMenu;
}
