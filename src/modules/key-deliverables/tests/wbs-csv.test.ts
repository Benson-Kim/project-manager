import { describe, expect, it } from "vitest";
import { wbsCsv } from "../components/wbs-csv";
import { buildWbs, type WbsItem, type WbsRequirement } from "../schemas/wbs";

function item(id: number, parentId: number | null, more: Partial<WbsItem> = {}): WbsItem {
  return {
    id,
    parentId,
    sortOrder: id,
    name: `Item ${id}`,
    requestedDate: null,
    start: null,
    end: null,
    status: null,
    priority: null,
    color: null,
    isMilestone: false,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    budget: null,
    note: null,
    rowVer: id,
    ...more,
  };
}

function req(id: number, more: Partial<WbsRequirement> = {}): WbsRequirement {
  return {
    id,
    type: "FR",
    ref: `FR-${id}`,
    text: `R${id}`,
    isMet: false,
    sortOrder: id,
    rowVer: id,
    placeRowVer: id,
    parentId: null,
    moscow: null,
    criteria: null,
    estimateDays: null,
    ownerId: null,
    ownerName: null,
    ...more,
  };
}

function lines(items: WbsItem[]): string[] {
  const csv = wbsCsv(buildWbs(items));
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(1, -2).split("\r\n");
}

describe("wbsCsv", () => {
  it("lists every item in breakdown order with its code, dates and type", () => {
    const rows = lines([
      item(1, null, {
        start: new Date(Date.UTC(2026, 0, 5)),
        end: new Date(Date.UTC(2026, 1, 20)),
      }),
      item(2, 1, {
        start: new Date(Date.UTC(2026, 0, 5)),
        end: new Date(Date.UTC(2026, 1, 20)),
        assignees: [
          { id: 4, name: "Ana" },
          { id: 5, name: "Bo" },
        ],
        status: "Completed",
      }),
      item(3, null, {
        isMilestone: true,
        start: new Date(Date.UTC(2026, 2, 1)),
        end: new Date(Date.UTC(2026, 2, 1)),
      }),
    ]);
    expect(rows[0]).toBe("WBS,Name,Type,MoSCoW,Assignee,Est. days,Start,End,Progress %,Budget");
    expect(rows.slice(1)).toEqual([
      "1,Item 1,Item,,,,2026-01-05,2026-02-20,100,",
      "1.1,Item 2,Item,,Ana; Bo,,2026-01-05,2026-02-20,100,",
      "2,Item 3,Milestone,,,,2026-03-01,2026-03-01,0,",
    ]);
  });

  it("puts each item's requirements under it, parents first, with progress from met ticks", () => {
    const rows = lines([
      item(1, null, {
        requirements: [
          req(11, { moscow: "M", estimateDays: 2, ownerName: "Ana" }),
          req(12, { parentId: 11, isMet: true, estimateDays: 1.5 }),
          req(13, { parentId: 11, sortOrder: 0 }),
          req(14, { type: "NFR", ref: "NFR-1", moscow: "W", isMet: true }),
        ],
      }),
    ]);
    expect(rows.slice(1)).toEqual([
      "1,Item 1,Item,,,3.5,,,75,",
      "FR-11,R11,FR,M,Ana,2.0,,,50,",
      "FR-13,R13,FR,,,,,,0,",
      "FR-12,R12,FR,,,1.5,,,100,",
      "NFR-1,R14,NFR,W,,,,,100,",
    ]);
  });

  it("rolls budgets up to parents and writes them with two decimals", () => {
    const rows = lines([
      item(1, null),
      item(2, 1, { budget: 1200 }),
      item(3, 1, { budget: 300.5 }),
    ]);
    expect(rows.slice(1).map((r) => r.split(",").at(-1))).toEqual(["1500.50", "1200.00", "300.50"]);
  });

  it("rolls effort up to parents, counting the parent's own estimates", () => {
    const rows = lines([
      item(1, null, { requirements: [req(11, { estimateDays: 1 })] }),
      item(2, 1, { requirements: [req(12, { estimateDays: 2.5 })] }),
      item(3, 1),
    ]);
    const effortOf = (code: string) => rows.find((r) => r.startsWith(`${code},`))!.split(",")[5];
    expect(effortOf("1")).toBe("3.5");
    expect(effortOf("1.1")).toBe("2.5");
    expect(effortOf("1.2")).toBe("");
  });

  it("quotes commas and quotes, and defuses text a spreadsheet would run", () => {
    const rows = lines([
      item(1, null, { name: '=HYPERLINK("x")' }),
      item(2, null, { name: "Design, build" }),
    ]);
    expect(rows[1]).toBe(`1,"'=HYPERLINK(""x"")",Item,,,,,,0,`);
    expect(rows[2]).toBe(`2,"Design, build",Item,,,,,,0,`);
  });

  it("still lists every requirement once when their parents form a loop", () => {
    const rows = lines([
      item(1, null, {
        requirements: [req(21, { parentId: 22 }), req(22, { parentId: 21 })],
      }),
    ]);
    expect(rows.slice(2).map((r) => r.split(",")[0])).toEqual(["FR-21", "FR-22"]);
  });
});
