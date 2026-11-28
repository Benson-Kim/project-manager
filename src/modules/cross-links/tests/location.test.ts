import { describe, expect, it } from "vitest";
import {
  CROSS_LINK_MODULES,
  buildLocationHref,
  isSameEndpoint,
  locationAnchorSchema,
  normalizeAnchorKey,
  parseLocationFromHref,
  type CrossLinkModuleKey,
  type LocationAnchor,
} from "../schemas/location";

const SAMPLE_BY_MODULE: Record<CrossLinkModuleKey, { loc: LocationAnchor; expectedPath: string }> =
  {
    dashboard: {
      loc: {
        moduleKey: "dashboard",
        projectId: null,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/",
    },
    reports: {
      loc: {
        moduleKey: "reports",
        projectId: null,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/reports",
    },
    "project-overview": {
      loc: {
        moduleKey: "project-overview",
        projectId: 7,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7",
    },
    objectives: {
      loc: {
        moduleKey: "objectives",
        projectId: 7,
        entityId: 12,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:12",
      },
      expectedPath: "/projects/7/objectives?id=12#cl-row:12",
    },
    requirements: {
      loc: {
        moduleKey: "requirements",
        projectId: 7,
        entityId: 44,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:44",
      },
      expectedPath: "/projects/7/requirements?id=44#cl-row:44",
    },
    deliverables: {
      loc: {
        moduleKey: "deliverables",
        projectId: 7,
        entityId: 9,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:9",
      },
      expectedPath: "/projects/7/deliverables?d=9#cl-row:9",
    },
    "deliverables-canvas": {
      loc: {
        moduleKey: "deliverables-canvas",
        projectId: 7,
        entityId: 5,
        subEntityId: 18,
        anchorKind: "subrecord",
        anchorKey: "node:18",
      },
      expectedPath: "/projects/7/deliverables/canvas?canvas=5&inspect=18#cl-node:18",
    },
    "deliverables-gantt": {
      loc: {
        moduleKey: "deliverables-gantt",
        projectId: 7,
        entityId: 9,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "bar:9",
      },
      expectedPath: "/projects/7/deliverables/gantt?view=gantt&d=9#cl-bar:9",
    },
    stakeholders: {
      loc: {
        moduleKey: "stakeholders",
        projectId: 7,
        entityId: 3,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:3",
      },
      expectedPath: "/projects/7/stakeholders?id=3#cl-row:3",
    },
    "stakeholders-matrix": {
      loc: {
        moduleKey: "stakeholders-matrix",
        projectId: 7,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/stakeholders/matrix",
    },
    responsibility: {
      loc: {
        moduleKey: "responsibility",
        projectId: 7,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/responsibility",
    },
    suppliers: {
      loc: {
        moduleKey: "suppliers",
        projectId: 7,
        entityId: 6,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:6",
      },
      expectedPath: "/projects/7/suppliers?id=6#cl-row:6",
    },
    keywords: {
      loc: {
        moduleKey: "keywords",
        projectId: 7,
        entityId: 2,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:2",
      },
      expectedPath: "/projects/7/keywords?id=2#cl-row:2",
    },
    "daily-activity": {
      loc: {
        moduleKey: "daily-activity",
        projectId: 7,
        entityId: 8,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:8",
      },
      expectedPath: "/projects/7/daily-activities?id=8#cl-row:8",
    },
    todo: {
      loc: {
        moduleKey: "todo",
        projectId: null,
        entityId: 21,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:21",
      },
      expectedPath: "/todo?id=21#cl-row:21",
    },
    calendar: {
      loc: {
        moduleKey: "calendar",
        projectId: 7,
        entityId: 21,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "item:21",
      },
      expectedPath: "/projects/7/calendar#cl-item:21",
    },
    "questions-answers": {
      loc: {
        moduleKey: "questions-answers",
        projectId: 7,
        entityId: 11,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:11",
      },
      expectedPath: "/projects/7/questions-answers?id=11#cl-row:11",
    },
    "parking-lot": {
      loc: {
        moduleKey: "parking-lot",
        projectId: 7,
        entityId: 13,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:13",
      },
      expectedPath: "/projects/7/parking-lot?id=13#cl-row:13",
    },
    "assumptions-constraints": {
      loc: {
        moduleKey: "assumptions-constraints",
        projectId: 7,
        entityId: 14,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:14",
      },
      expectedPath: "/projects/7/assumptions-constraints?id=14#cl-row:14",
    },
    "risks-issues": {
      loc: {
        moduleKey: "risks-issues",
        projectId: 7,
        entityId: 15,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:15",
      },
      expectedPath: "/projects/7/risks-issues?id=15#cl-row:15",
    },
    decisions: {
      loc: {
        moduleKey: "decisions",
        projectId: 7,
        entityId: 16,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:16",
      },
      expectedPath: "/projects/7/decisions?id=16#cl-row:16",
    },
    whiteboard: {
      loc: {
        moduleKey: "whiteboard",
        projectId: 7,
        entityId: 4,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/whiteboard?board=4",
    },
    bpmn: {
      loc: {
        moduleKey: "bpmn",
        projectId: 7,
        entityId: 19,
        subEntityId: null,
        anchorKind: "subrecord",
        anchorKey: "shape:node_1",
      },
      expectedPath: "/projects/7/bpmn?diagram=19#cl-shape:node_1",
    },
    meetings: {
      loc: {
        moduleKey: "meetings",
        projectId: 7,
        entityId: 30,
        subEntityId: 4,
        anchorKind: "section",
        anchorKey: "section:agenda",
      },
      expectedPath: "/projects/7/meetings/30#cl-section:agenda",
    },
    board: {
      loc: {
        moduleKey: "board",
        projectId: 7,
        entityId: 22,
        subEntityId: 91,
        anchorKind: "subrecord",
        anchorKey: "card:91",
      },
      expectedPath: "/projects/7/boards/22#cl-card:91",
    },
    checklists: {
      loc: {
        moduleKey: "checklists",
        projectId: 7,
        entityId: 10,
        subEntityId: 50,
        anchorKind: "subrecord",
        anchorKey: "item:50",
      },
      expectedPath: "/projects/7/checklists?checklist=10#cl-item:50",
    },
    note: {
      loc: {
        moduleKey: "note",
        projectId: null,
        entityId: 88,
        subEntityId: 3,
        anchorKind: "section",
        anchorKey: "tab:3",
      },
      expectedPath: "/notes/88#cl-tab:3",
    },
    "financials-budget": {
      loc: {
        moduleKey: "financials-budget",
        projectId: 7,
        entityId: 41,
        subEntityId: 5,
        anchorKind: "subrecord",
        anchorKey: "line:5",
      },
      expectedPath: "/projects/7/financials/budget?f=41#cl-line:5",
    },
    "financials-monitoring": {
      loc: {
        moduleKey: "financials-monitoring",
        projectId: 7,
        entityId: 41,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/financials/monitoring?f=41",
    },
    "financials-documents": {
      loc: {
        moduleKey: "financials-documents",
        projectId: 7,
        entityId: 41,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/financials/documents?f=41",
    },
    "financials-settings": {
      loc: {
        moduleKey: "financials-settings",
        projectId: 7,
        entityId: 41,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/financials/settings?f=41",
    },
    "financials-project-math": {
      loc: {
        moduleKey: "financials-project-math",
        projectId: 7,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/financials/project-math",
    },
    "financials-sheet": {
      loc: {
        moduleKey: "financials-sheet",
        projectId: 7,
        entityId: 41,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      },
      expectedPath: "/projects/7/financials/41",
    },
  };

describe("cross-links allowlisted location builders and parsers", () => {
  it("builds safe relative hrefs for every single module in CROSS_LINK_MODULES", () => {
    for (const key of CROSS_LINK_MODULES) {
      const sample = SAMPLE_BY_MODULE[key];
      const href = buildLocationHref(sample.loc);
      expect(href).toBe(sample.expectedPath);
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toMatch(/^(https?:|javascript:|\/\/)/i);
    }
  });

  it("heals movable entity URLs using SQL liveProjectId instead of stored projectId", () => {
    const movedBoard: LocationAnchor = {
      moduleKey: "board",
      projectId: 7,
      entityId: 22,
      subEntityId: null,
      anchorKind: "page",
      anchorKey: null,
    };
    expect(buildLocationHref(movedBoard, 99)).toBe("/projects/99/boards/22");
    expect(buildLocationHref(movedBoard, null)).toBe("/boards/22");

    const movedTodo: LocationAnchor = {
      moduleKey: "todo",
      projectId: 7,
      entityId: 50,
      subEntityId: null,
      anchorKind: "record",
      anchorKey: "row:50",
    };
    expect(buildLocationHref(movedTodo, null)).toBe("/todo?id=50#cl-row:50");
    expect(buildLocationHref(movedTodo, 14)).toBe("/projects/14/todos?id=50#cl-row:50");
  });

  it("rejects mismatched module shapes and malicious anchor keys", () => {
    expect(() =>
      locationAnchorSchema.parse({
        moduleKey: "dashboard",
        projectId: 5,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      }),
    ).toThrow();

    expect(() =>
      locationAnchorSchema.parse({
        moduleKey: "risks-issues",
        projectId: null,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      }),
    ).toThrow();

    expect(() =>
      locationAnchorSchema.parse({
        moduleKey: "financials-sheet",
        projectId: 5,
        entityId: null,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
      }),
    ).toThrow();

    expect(normalizeAnchorKey("<script>")).toBeNull();
    expect(normalizeAnchorKey("javascript:alert(1)")).toBeNull();
    expect(normalizeAnchorKey("row:12")).toBe("row:12");
  });

  it("parses workspace and non-linkable routes accurately", () => {
    expect(parseLocationFromHref("/projects/7/risks-issues", "?id=15")?.moduleKey).toBe(
      "risks-issues",
    );
    expect(parseLocationFromHref("/projects/7/bpmn", "", 19)).toEqual({
      moduleKey: "bpmn",
      projectId: 7,
      entityId: 19,
      subEntityId: null,
      anchorKind: "page",
      anchorKey: null,
    });
    expect(parseLocationFromHref("/notes/44")).toEqual({
      moduleKey: "note",
      projectId: null,
      entityId: 44,
      subEntityId: null,
      anchorKind: "page",
      anchorKey: null,
    });
    // Print, auth, settings, projects directory, and search are excluded
    expect(parseLocationFromHref("/login")).toBeNull();
    expect(parseLocationFromHref("/settings")).toBeNull();
    expect(parseLocationFromHref("/projects")).toBeNull();
    expect(parseLocationFromHref("/projects/7/deliverables/gantt/print")).toBeNull();
  });

  it("detects identical endpoints cleanly", () => {
    const a: LocationAnchor = {
      moduleKey: "risks-issues",
      projectId: 7,
      entityId: 12,
      subEntityId: null,
      anchorKind: "record",
      anchorKey: "row:12",
    };
    const b: LocationAnchor = { ...a };
    const c: LocationAnchor = { ...a, entityId: 13, anchorKey: "row:13" };
    expect(isSameEndpoint(a, b)).toBe(true);
    expect(isSameEndpoint(a, c)).toBe(false);
  });
});
