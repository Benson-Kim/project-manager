import { afterEach, describe, expect, it, vi } from "vitest";
import { isEditableElement, resolveEndpointFromTarget } from "../components/anchor-capture";

function pageRoot(entity?: { id: string; label: string }): ParentNode {
  return {
    querySelector(sel: string) {
      if (entity && sel === "[data-cl-page-entity]") {
        return { dataset: { clPageEntity: entity.id, clPageLabel: entity.label } };
      }
      return null;
    },
  } as unknown as ParentNode;
}

function targetWithAnchor(dataset: Record<string, string> | null): EventTarget {
  const target = {
    closest: (s: string) => (s === "[data-cl-anchor]" ? (dataset ? { dataset } : null) : null),
  };
  vi.stubGlobal("Element", target.constructor);
  return target as unknown as EventTarget;
}

describe("anchor kinds", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("captures the page when no anchor is under the pointer", () => {
    vi.stubGlobal("document", { title: "Requirements" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor(null),
      "/projects/3/requirements",
      "",
      pageRoot(),
    );
    expect(ep).toMatchObject({
      moduleKey: "requirements",
      projectId: 3,
      anchorKind: "page",
      anchorKey: null,
    });
  });

  it("captures a section anchor with its key", () => {
    vi.stubGlobal("document", { title: "Requirements" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor({
        clAnchor: "section",
        clAnchorKey: "section:scope",
        clAnchorLabel: "Scope",
      }),
      "/projects/3/requirements",
      "",
      pageRoot(),
    );
    expect(ep).toMatchObject({
      anchorKind: "section",
      anchorKey: "section:scope",
      subEntityId: null,
      label: "Scope",
    });
  });

  it("captures a record anchor with the row id as the entity", () => {
    vi.stubGlobal("document", { title: "Requirements" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor({
        clAnchor: "record",
        clAnchorKey: "row:12",
        clEntityId: "12",
        clAnchorLabel: "REQ-12",
      }),
      "/projects/3/requirements",
      "",
      pageRoot(),
    );
    expect(ep).toMatchObject({
      anchorKind: "record",
      anchorKey: "row:12",
      entityId: 12,
      subEntityId: null,
    });
  });

  it("captures a subrecord anchor under the page entity", () => {
    vi.stubGlobal("document", { title: "Diagrams" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor({
        clAnchor: "subrecord",
        clAnchorKey: "shape:task_1",
        clAnchorLabel: "Task",
      }),
      "/projects/3/bpmn",
      "",
      pageRoot({ id: "44", label: "Billing Flow" }),
    );
    expect(ep).toMatchObject({ anchorKind: "subrecord", anchorKey: "shape:task_1", entityId: 44 });
  });

  it("maps a checklist row to a subrecord of the open checklist", () => {
    vi.stubGlobal("document", { title: "Checklists" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor({
        clAnchor: "record",
        clAnchorKey: "row:7",
        clEntityId: "7",
        clAnchorLabel: "Sign off",
      }),
      "/projects/3/checklists",
      "",
      pageRoot({ id: "9", label: "Go-live" }),
    );
    expect(ep).toMatchObject({
      moduleKey: "checklists",
      entityId: 9,
      subEntityId: 7,
      anchorKind: "subrecord",
      anchorKey: "row:7",
    });
  });

  it("falls back to the page for a checklist row with no open checklist", () => {
    vi.stubGlobal("document", { title: "Checklists" });
    const ep = resolveEndpointFromTarget(
      targetWithAnchor({ clAnchor: "record", clAnchorKey: "row:7", clEntityId: "7" }),
      "/projects/3/checklists",
      "",
      pageRoot(),
    );
    expect(ep).toMatchObject({
      moduleKey: "checklists",
      anchorKind: "page",
      anchorKey: null,
      subEntityId: null,
    });
  });
});

describe("isEditableElement", () => {
  class FakeElement {
    constructor(private readonly tag: string) {}
    closest(selector: string) {
      return selector.split(", ").includes(this.tag) ? this : null;
    }
  }
  const asTarget = (tag: string) => new FakeElement(tag) as unknown as EventTarget;

  function withElement(run: () => void) {
    const had = "Element" in globalThis;
    const before = (globalThis as { Element?: unknown }).Element;
    (globalThis as { Element?: unknown }).Element = FakeElement;
    try {
      run();
    } finally {
      if (had) (globalThis as { Element?: unknown }).Element = before;
      else delete (globalThis as { Element?: unknown }).Element;
    }
  }

  it("keeps out of the way of text entry", () => {
    withElement(() => {
      expect(isEditableElement(asTarget("input"))).toBe(true);
      expect(isEditableElement(asTarget("textarea"))).toBe(true);
      expect(isEditableElement(asTarget("[contenteditable='true']"))).toBe(true);
    });
  });

  it("leaves a dropdown to this page's own menu, since it holds no text to copy", () => {
    withElement(() => {
      expect(isEditableElement(asTarget("select"))).toBe(false);
      expect(isEditableElement(asTarget("td"))).toBe(false);
    });
  });

  it("takes a non-element target as not editable", () => {
    withElement(() => {
      expect(isEditableElement(null)).toBe(false);
    });
  });
});
