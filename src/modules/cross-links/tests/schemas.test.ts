import { describe, expect, it } from "vitest";
import {
  createCrossLinkInput,
  crossLinkDbRowSchema,
  normalizePlainText,
  updateCrossLinkInput,
} from "../schemas/cross-link";
import { createPageNoteInput, pageNoteDbRowSchema } from "../schemas/page-note";

const endA = {
  moduleKey: "risks-issues" as const,
  projectId: 2,
  entityId: 10,
  subEntityId: null,
  anchorKind: "record" as const,
  anchorKey: "row:10",
  label: "Supply delay",
};

const endB = {
  moduleKey: "decisions" as const,
  projectId: 2,
  entityId: 15,
  subEntityId: null,
  anchorKind: "record" as const,
  anchorKey: "row:15",
  label: "Switch supplier",
};

describe("cross-links and page-notes plain-text and DTO schemas", () => {
  it("strips control chars while allowing legitimate mathematical comparisons", () => {
    expect(normalizePlainText("  Budget\u0007 overrun\nline 2 ", false)).toBe(
      "Budget  overrun line 2",
    );
    expect(normalizePlainText("a < b and c > d", true)).toBe("a < b and c > d");

    const okLink = createCrossLinkInput.parse({
      endA,
      endB,
      linkTitle: "Mitigation",
      noteText: "Cost < $50k if done in Q1",
      color: "blue",
    });
    expect(okLink.noteText).toBe("Cost < $50k if done in Q1");
  });

  it("refuses markup / HTML injection payloads and self-links", () => {
    expect(() =>
      createCrossLinkInput.parse({
        endA,
        endB,
        linkTitle: "<img src=x onerror=alert(1)>",
        color: "yellow",
      }),
    ).toThrow();

    expect(() =>
      createPageNoteInput.parse({
        ...endA,
        anchorLabel: endA.label,
        body: "<!-- hidden --> <script>alert(1)</script>",
        color: "yellow",
      }),
    ).toThrow();

    expect(() =>
      createCrossLinkInput.parse({
        endA,
        endB: { ...endA },
        linkTitle: "Self link",
      }),
    ).toThrow();
  });

  it("enforces lengths and positive RowVer coercion", () => {
    expect(() =>
      createCrossLinkInput.parse({
        endA,
        endB,
        linkTitle: "x".repeat(121),
      }),
    ).toThrow();

    expect(() =>
      createPageNoteInput.parse({
        ...endA,
        body: "x".repeat(1001),
      }),
    ).toThrow();

    const upd = updateCrossLinkInput.parse({
      crossLinkId: 4,
      linkTitle: "Updated",
      noteText: "",
      color: "green",
      rowVer: "42",
    });
    expect(upd.noteText).toBeNull();
    expect(upd.rowVer).toBe(42);
  });

  it("parses SQL result rows with Date objects and string RowVer values", () => {
    const cl = crossLinkDbRowSchema.parse({
      CrossLinkId: 9,
      Side: "B",
      EndAModule: "risks-issues",
      EndAProjectId: 2,
      EndAEntityId: 10,
      EndASubEntityId: null,
      EndAAnchorKind: "record",
      EndAAnchorKey: "row:10",
      EndALabel: "Risk 10",
      EndBModule: "decisions",
      EndBProjectId: 3,
      EndBEntityId: 20,
      EndBSubEntityId: null,
      EndBAnchorKind: "record",
      EndBAnchorKey: "row:20",
      EndBLabel: "Decision 20",
      LinkTitle: "Escalation",
      NoteText: null,
      Color: "yellow",
      CreatedBy: 4,
      CreatedAtUtc: new Date("2026-11-27T08:00:00Z"),
      UpdatedAtUtc: null,
      RowVer: "112",
    });
    expect(cl.CreatedAtUtc).toBe("2026-11-27T08:00:00.000Z");
    expect(cl.RowVer).toBe(112);

    const pn = pageNoteDbRowSchema.parse({
      PageNoteId: 5,
      ModuleKey: "dashboard",
      ProjectId: null,
      EntityId: null,
      SubEntityId: null,
      AnchorKind: "page",
      AnchorKey: null,
      AnchorLabel: "Home",
      Body: "Check backlog today",
      Color: "orange",
      CreatedBy: 4,
      CreatedAtUtc: "2026-11-27T08:00:00Z",
      UpdatedAtUtc: null,
      RowVer: 7,
    });
    expect(pn.RowVer).toBe(7);
  });
});
