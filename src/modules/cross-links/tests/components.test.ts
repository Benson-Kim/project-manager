import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/search/actions", () => ({
  searchGlobalAction: vi.fn(),
}));

import { AnchorSlot } from "../components/anchor-slot";
import {
  readPageEntityFromDom,
  resolveEndpointFromTarget,
  writeElectronContextMenuHint,
} from "../components/anchor-capture";
import {
  CrossLinkMenuContext,
  type CrossLinkMenuContextValue,
} from "../components/context-menu-bridge";
import { CrossLinkDialog } from "../components/cross-link-dialog";
import { PageNoteDialog } from "../components/page-note-dialog";
import { PageStickiesStrip } from "../components/page-stickies-strip";
import {
  clearPendingCrossLink,
  readPendingCrossLink,
  setPendingCrossLink,
  subscribePendingCrossLink,
} from "../components/pending-link-storage";
import { PendingPortalDock } from "../components/pending-portal-dock";
import type { CrossLinkItem } from "../schemas/cross-link";
import type { PageNoteItem } from "../schemas/page-note";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<(e: MessageEvent) => void>();
  constructor(readonly name: string) {
    const set = FakeBroadcastChannel.channels.get(name) ?? new Set();
    set.add(this);
    FakeBroadcastChannel.channels.set(name, set);
  }
  addEventListener(_type: string, fn: (e: MessageEvent) => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_type: string, fn: (e: MessageEvent) => void) {
    this.listeners.delete(fn);
  }
  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this) continue;
      for (const fn of peer.listeners) {
        fn({ data } as MessageEvent);
      }
    }
  }
  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

function makeCtx(overrides: Partial<CrossLinkMenuContextValue> = {}): CrossLinkMenuContextValue {
  return {
    location: {
      moduleKey: "decisions",
      projectId: 2,
      entityId: null,
      subEntityId: null,
      anchorKind: "page",
      anchorKey: null,
    },
    pageLabel: "Decisions",
    pendingSource: null,
    links: [],
    notes: [],
    loading: false,
    currentUserId: 4,
    openAddPageNote: vi.fn(),
    startCrossLink: vi.fn(),
    completeCrossLink: vi.fn(),
    cancelPendingCrossLink: vi.fn(),
    openEditCrossLink: vi.fn(),
    openDeleteCrossLink: vi.fn(),
    openEditPageNote: vi.fn(),
    openDeletePageNote: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

const SAMPLE_LINK: CrossLinkItem = {
  crossLinkId: 101,
  side: "A",
  here: {
    moduleKey: "decisions",
    projectId: 2,
    entityId: 12,
    subEntityId: null,
    anchorKind: "record",
    anchorKey: "row:12",
    label: "Approve vendor",
    href: "/projects/2/decisions?id=12#cl-row:12",
  },
  there: {
    moduleKey: "risks-issues",
    projectId: 5,
    entityId: 88,
    subEntityId: null,
    anchorKind: "record",
    anchorKey: "row:88",
    label: "SLA delay",
    href: "/projects/5/risks-issues?id=88#cl-row:88",
  },
  endA: {
    moduleKey: "decisions",
    projectId: 2,
    entityId: 12,
    subEntityId: null,
    anchorKind: "record",
    anchorKey: "row:12",
    label: "Approve vendor",
    href: "/projects/2/decisions?id=12#cl-row:12",
  },
  endB: {
    moduleKey: "risks-issues",
    projectId: 5,
    entityId: 88,
    subEntityId: null,
    anchorKind: "record",
    anchorKey: "row:88",
    label: "SLA delay",
    href: "/projects/5/risks-issues?id=88#cl-row:88",
  },
  linkTitle: "Linked mitigation",
  noteText: "Wait for Q3 SLA review",
  color: "blue",
  createdBy: 4,
  createdAtUtc: "2026-11-27T09:00:00.000Z",
  updatedAtUtc: null,
  rowVer: 1,
};

const SAMPLE_NOTE: PageNoteItem = {
  pageNoteId: 202,
  moduleKey: "decisions",
  projectId: 2,
  entityId: 12,
  subEntityId: null,
  anchorKind: "record",
  anchorKey: "row:12",
  anchorLabel: "Approve vendor",
  body: "Check sign-off before Friday",
  color: "yellow",
  href: "/projects/2/decisions?id=12#cl-row:12",
  createdBy: 4,
  createdAtUtc: "2026-11-27T09:00:00.000Z",
  updatedAtUtc: null,
  rowVer: 1,
};

describe("cross-links client storage, DOM capture, and sticky/portal UI", () => {
  beforeEach(() => {
    FakeBroadcastChannel.channels.clear();
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists pending source in sessionStorage and syncs across BroadcastChannel peers", () => {
    const received: Array<ReturnType<typeof readPendingCrossLink>> = [];
    const unsub = subscribePendingCrossLink((next) => received.push(next));

    const saved = setPendingCrossLink({
      moduleKey: "risks-issues",
      projectId: 2,
      entityId: 9,
      subEntityId: null,
      anchorKind: "record",
      anchorKey: "row:9",
      label: "Vendor bottleneck",
    });

    expect(readPendingCrossLink()?.label).toBe("Vendor bottleneck");
    expect(received.at(-1)?.entityId).toBe(9);
    expect(saved.startedAtIso).toBeTruthy();

    clearPendingCrossLink();
    expect(readPendingCrossLink()).toBeNull();
    expect(received.at(-1)).toBeNull();
    unsub();
  });

  it("rejects tampered sessionStorage pending payloads safely", () => {
    (window.sessionStorage as unknown as MemoryStorage).setItem(
      "pm:pending-cross-link:v1",
      JSON.stringify({
        moduleKey: "javascript:alert(1)",
        projectId: 1,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
        label: "Bad",
        startedAtIso: "now",
      }),
    );
    expect(readPendingCrossLink()).toBeNull();
  });

  it("reads workspace page entity & record anchors without raw URLs or pixels", () => {
    vi.stubGlobal("document", { title: "Diagrams — Project Manager" });

    const fakePageRoot = {
      querySelector(sel: string) {
        if (sel === "[data-cl-page-entity]") {
          return { dataset: { clPageEntity: "44", clPageLabel: "Billing Flow" } };
        }
        return null;
      },
    } as unknown as ParentNode;

    expect(readPageEntityFromDom(fakePageRoot)).toEqual({
      entityId: 44,
      label: "Billing Flow",
    });

    const anchorNode = {
      dataset: {
        clAnchor: "subrecord",
        clAnchorKey: "shape:task_1",
        clAnchorLabel: "Review <b>invoice</b>",
      },
    };
    const fakeTarget = {
      closest: (s: string) => (s === "[data-cl-anchor]" ? anchorNode : null),
    };
    vi.stubGlobal("Element", fakeTarget.constructor);

    const ep = resolveEndpointFromTarget(
      fakeTarget as unknown as EventTarget,
      "/projects/3/bpmn",
      "",
      fakePageRoot,
    );
    expect(ep).toEqual({
      moduleKey: "bpmn",
      projectId: 3,
      entityId: 44,
      subEntityId: null,
      anchorKind: "subrecord",
      anchorKey: "shape:task_1",
      label: "Review  invoice",
    });
  });

  it("writes clamped 4-field dataset hint for Electron without self-completion", () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });

    const endpoint = {
      moduleKey: "decisions" as const,
      projectId: 2,
      entityId: 12,
      subEntityId: null,
      anchorKind: "record" as const,
      anchorKey: "row:12",
      label: "A".repeat(60),
    };

    writeElectronContextMenuHint({
      location: endpoint,
      endpoint,
      pending: { ...endpoint, startedAtIso: "2026-11-27T00:00:00Z" },
    });

    const sameHint = JSON.parse(dataset.pmContextMenu);
    expect(sameHint.canCompleteLink).toBe(false);
    expect(sameHint.pendingLabel.length).toBe(40);
  });

  it("renders inline AnchorSlot badges with allowlisted hrefs and promotes off-page items to PageStickiesStrip", () => {
    const emptySlot = renderToStaticMarkup(
      React.createElement(
        CrossLinkMenuContext.Provider,
        { value: makeCtx() },
        React.createElement(AnchorSlot, {
          anchorKind: "record",
          anchorKey: "row:99",
          entityId: 99,
        }),
      ),
    );
    expect(emptySlot).toContain('data-cl-slot-key="row:99"');
    expect(emptySlot).toContain('class="hidden"');

    const slotHtml = renderToStaticMarkup(
      React.createElement(
        CrossLinkMenuContext.Provider,
        { value: makeCtx({ links: [SAMPLE_LINK], notes: [SAMPLE_NOTE] }) },
        React.createElement(AnchorSlot, {
          anchorKind: "record",
          anchorKey: "row:12",
          entityId: 12,
        }),
      ),
    );
    expect(slotHtml).toContain('href="/projects/5/risks-issues?id=88#cl-row:88"');
    expect(slotHtml).toContain("Linked mitigation");
    expect(slotHtml).toContain("Check sign-off before Friday");
    expect(slotHtml).toContain("print:hidden");

    const mountedStrip = renderToStaticMarkup(
      React.createElement(
        CrossLinkMenuContext.Provider,
        { value: makeCtx({ links: [SAMPLE_LINK], notes: [SAMPLE_NOTE] }) },
        React.createElement(PageStickiesStrip, {
          mountedAnchorKeys: new Set(["row:12"]),
          arrivalReturn: null,
          onDismissArrivalReturn: vi.fn(),
        }),
      ),
    );
    expect(mountedStrip).toBe("");

    const promotedStrip = renderToStaticMarkup(
      React.createElement(
        CrossLinkMenuContext.Provider,
        { value: makeCtx({ links: [SAMPLE_LINK], notes: [SAMPLE_NOTE] }) },
        React.createElement(PageStickiesStrip, {
          mountedAnchorKeys: new Set(),
          arrivalReturn: null,
          onDismissArrivalReturn: vi.fn(),
        }),
      ),
    );
    expect(promotedStrip).toContain("On Approve vendor");
    expect(promotedStrip).toContain("print:hidden");
    expect(promotedStrip).not.toContain("Only you");
  });

  it("marks global personal page notes as Only you and renders PendingPortalDock cleanly", () => {
    const personalNote: PageNoteItem = {
      ...SAMPLE_NOTE,
      moduleKey: "dashboard",
      projectId: null,
      entityId: null,
      anchorKind: "page",
      anchorKey: null,
      anchorLabel: "Home",
      href: "/",
    };

    const html = renderToStaticMarkup(
      React.createElement(
        CrossLinkMenuContext.Provider,
        { value: makeCtx({ notes: [personalNote] }) },
        React.createElement(PageStickiesStrip, {
          mountedAnchorKeys: new Set(),
          arrivalReturn: { returnHref: "/projects/2/decisions", returnLabel: "Decisions" },
          onDismissArrivalReturn: vi.fn(),
        }),
      ),
    );
    expect(html).toContain("Only you");
    expect(html).toContain("Back to Decisions");

    const dockHtml = renderToStaticMarkup(
      React.createElement(PendingPortalDock, {
        pendingSource: {
          moduleKey: "decisions",
          projectId: 2,
          entityId: 12,
          subEntityId: null,
          anchorKind: "record",
          anchorKey: "row:12",
          label: "Decision 12",
          startedAtIso: "2026-11-27T09:00:00Z",
        },
        currentLocationEndpoint: {
          moduleKey: "risks-issues",
          projectId: 2,
          entityId: 55,
          subEntityId: null,
          anchorKind: "page",
          anchorKey: null,
          label: "Risks & Issues",
        },
        onCompleteWithEndpoint: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(dockHtml).toContain("Decision 12");
    expect(dockHtml).toContain("Complete cross-link");
    expect(dockHtml).toContain("print:hidden");
  });

  it("keeps dialogs free of crashes when closed", () => {
    const closed = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(PageNoteDialog, {
          open: false,
          mode: "create",
          anchorLabel: "Home",
          onOpenChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
        React.createElement(CrossLinkDialog, {
          open: false,
          mode: "create",
          fromLabel: "A",
          toLabel: "B",
          onOpenChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    expect(closed).toBe("");
  });
});
