import { describe, expect, it } from "vitest";
import { diagramFramework, diagramSchema, EMPTY_DIAGRAM, type BpmnDiagram } from "../model/diagram";
import {
  addPool,
  addShape,
  connect,
  kindsLike,
  removeElements,
  setResponsibilityModel,
  setShapeKind,
  setStepDetail,
  setStepPerson,
} from "../model/edit";
import { diagramSteps, stepsByRole } from "../model/steps";
import { SHAPE_SPECS } from "../model/shapes";
import {
  accountableRole,
  RESPONSIBILITY_FRAMEWORKS,
} from "@/modules/stakeholders/schemas/responsibility-frameworks";

const names = { pool: "Pool", lane: (n: number) => `Lane ${n}` };

/** A pool with lanes "Lane 1" (top) and "Lane 2", a task in each, an end event outside and a note. */
function process(): BpmnDiagram {
  let d = addPool(EMPTY_DIAGRAM, { x: 0, y: 0 }, { pool: "p1", lanes: ["l1", "l2"] }, names);
  d = addShape(d, "task", { x: 400, y: 80 }, "late");
  d = addShape(d, "task", { x: 200, y: 240 }, "early");
  d = addShape(d, "endEvent", { x: 1000, y: 80 }, "done");
  d = addShape(d, "textAnnotation", { x: 100, y: 80 }, "note");
  return d;
}

const shape = (d: BpmnDiagram, id: string) => d.shapes.find((each) => each.id === id)!;
const valid = (d: BpmnDiagram) => diagramSchema.safeParse(d).success;

describe("step details", () => {
  it("sets, trims and clears a detail, and stores no details once all are cleared", () => {
    let d = setStepDetail(process(), "early", "duration", "  2 days  ");
    expect(shape(d, "early").step).toEqual({ duration: "2 days" });
    d = setStepDetail(d, "early", "duration", "");
    expect(shape(d, "early")).not.toHaveProperty("step");
    expect(valid(d)).toBe(true);
  });

  it("returns the same diagram when nothing changes, so Undo records nothing", () => {
    const d = setStepDetail(process(), "early", "sla", "4h");
    expect(setStepDetail(d, "early", "sla", " 4h ")).toBe(d);
    expect(setStepDetail(d, "missing", "sla", "1h")).toBe(d);
  });

  it("only takes a known status", () => {
    const d = process();
    expect(setStepDetail(d, "early", "status", "lost")).toBe(d);
    expect(shape(setStepDetail(d, "early", "status", "4"), "early").step).toEqual({
      status: "4",
    });
  });

  it("cuts a detail to the stored length", () => {
    const d = setStepDetail(process(), "early", "role", "x".repeat(500));
    expect(shape(d, "early").step?.role).toHaveLength(120);
    expect(valid(d)).toBe(true);
  });
});

describe("responsibility model", () => {
  it("uses RACI until the diagram picks another model", () => {
    const d = process();
    expect(diagramFramework(d).code).toBe("RACI");
    const daci = setResponsibilityModel(d, "DACI");
    expect(daci.responsibility).toBe("DACI");
    expect(diagramFramework(daci).roles.map((role) => role.code)).toEqual([
      "DRIVER",
      "APPROVER",
      "CONTRIBUTOR",
      "INFORMED",
    ]);
    expect(setResponsibilityModel(daci, "RACI")).not.toHaveProperty("responsibility");
    expect(setResponsibilityModel(d, "RACI")).toBe(d);
    expect(setResponsibilityModel(d, "NOPE")).toBe(d);
  });

  it("names people only for roles of the diagram's model", () => {
    const d = process();
    const raci = setStepPerson(d, "early", "ACCOUNTABLE", " Finance lead ");
    expect(shape(raci, "early").step).toEqual({ people: { ACCOUNTABLE: "Finance lead" } });
    expect(setStepPerson(d, "early", "DRIVER", "Ops")).toBe(d);
    const daci = setStepPerson(setResponsibilityModel(d, "DACI"), "early", "DRIVER", "Ops");
    expect(shape(daci, "early").step?.people).toEqual({ DRIVER: "Ops" });
    expect(valid(daci)).toBe(true);
  });

  it("keeps people across a model switch and drops the record once it is empty", () => {
    let d = setStepPerson(process(), "early", "RESPONSIBLE", "Analyst");
    d = setResponsibilityModel(setResponsibilityModel(d, "DACI"), "RACI");
    expect(shape(d, "early").step?.people).toEqual({ RESPONSIBLE: "Analyst", DRIVER: "Analyst" });
    d = setStepPerson(
      setStepPerson(process(), "early", "RESPONSIBLE", "Analyst"),
      "early",
      "RESPONSIBLE",
      "",
    );
    expect(shape(d, "early")).not.toHaveProperty("step");
  });

  it("carries each name to the role that means the same in the new model, filling only empty roles", () => {
    let d = setStepPerson(process(), "early", "ACCOUNTABLE", "Sales lead");
    d = setStepPerson(d, "early", "RESPONSIBLE", "Clerk");
    const daci = setResponsibilityModel(d, "DACI");
    expect(shape(daci, "early").step?.people).toMatchObject({
      APPROVER: "Sales lead",
      DRIVER: "Clerk",
    });
    const edited = setStepPerson(daci, "early", "APPROVER", "Finance");
    const back = setResponsibilityModel(edited, "RACI");
    expect(shape(back, "early").step?.people).toMatchObject({ ACCOUNTABLE: "Sales lead" });
    expect(shape(setResponsibilityModel(d, "RAPID"), "early").step?.people?.DECIDE).toBe(
      "Sales lead",
    );
    expect(valid(back)).toBe(true);
  });

  it("names the accountable role, or its nearest, in every model", () => {
    const codes = RESPONSIBILITY_FRAMEWORKS.map((f) => [f.code, accountableRole(f).code]);
    expect(Object.fromEntries(codes)).toMatchObject({
      RACI: "ACCOUNTABLE",
      DACI: "APPROVER",
      RAPID: "DECIDE",
      DARE: "DECIDER",
      MOCHA: "APPROVER",
      RATSI: "AUTHORITY",
    });
  });
});

describe("step type", () => {
  it("offers artifacts only artifacts, and flow symbols only flow symbols", () => {
    expect(kindsLike("dataObject").every((kind) => SHAPE_SPECS[kind].group === "artifacts")).toBe(
      true,
    );
    expect(kindsLike("task")).toContain("exclusiveGateway");
    expect(kindsLike("task")).not.toContain("dataStore");
  });

  it("changes kind about the centre, keeping its details and connectors", () => {
    let d = setStepDetail(process(), "early", "role", "Clerk");
    d = connect(d, {
      id: "f1",
      kind: "sequence",
      source: "early",
      target: "late",
      sourceSide: "right",
      targetSide: "left",
    });
    expect(d.flows).toHaveLength(1);
    const before = shape(d, "early");
    const next = setShapeKind(d, "early", "exclusiveGateway");
    const after = shape(next, "early");
    expect(after.kind).toBe("exclusiveGateway");
    expect(after.width).toBe(SHAPE_SPECS.exclusiveGateway.width);
    expect(after.x + after.width / 2).toBe(before.x + before.width / 2);
    expect(after.step).toEqual({ role: "Clerk" });
    expect(next.flows).toEqual(d.flows);
    expect(setShapeKind(d, "early", "dataStore")).toBe(d);
  });

  it("keeps an activity's size when it becomes another activity", () => {
    const d = process();
    const after = shape(setShapeKind(d, "early", "userTask"), "early");
    expect([after.width, after.height]).toEqual([
      shape(d, "early").width,
      shape(d, "early").height,
    ]);
  });
});

describe("steps for the swimlane and matrix views", () => {
  it("lists steps left to right without notes, with their lane, and the role over the lane", () => {
    const d = setStepDetail(process(), "late", "role", "Approver");
    expect(diagramSteps(d).map((row) => [row.shape.id, row.lane, row.role])).toEqual([
      ["early", "Lane 2", "Lane 2"],
      ["late", "Lane 1", "Approver"],
      ["done", null, null],
    ]);
  });

  it("groups steps by role in order of first appearance, with no role last", () => {
    let d = process();
    d = addShape(d, "task", { x: 600, y: 240 }, "later");
    const groups = stepsByRole(diagramSteps(removeElements(d, new Set(["late"]))));
    expect(groups.map((group) => [group.role, group.steps.map((row) => row.shape.id)])).toEqual([
      ["Lane 2", ["early", "later"]],
      [null, ["done"]],
    ]);
  });
});

describe("step details in the saved document", () => {
  const withStep = (step: unknown, extra: object = {}) => ({
    ...process(),
    ...extra,
    shapes: process().shapes.map((each) => (each.id === "early" ? { ...each, step } : each)),
  });

  it("accepts old diagrams with no details, and details within the rules", () => {
    expect(diagramSchema.safeParse(process()).success).toBe(true);
    const step = { status: "2", sla: "1d", people: { DRIVER: "Ops" } };
    expect(diagramSchema.safeParse(withStep(step, { responsibility: "DACI" })).success).toBe(true);
  });

  it("drops a status saved before statuses were a list", () => {
    const parsed = diagramSchema.parse(withStep({ status: "active", sla: "1d" }));
    expect(parsed.shapes.find((each) => each.id === "early")?.step).toEqual({ sla: "1d" });
  });

  it("rejects unknown fields, statuses, roles, models and over-long text", () => {
    expect(diagramSchema.safeParse(withStep({ owner: "x" })).success).toBe(false);
    expect(diagramSchema.safeParse(withStep({ status: 12 })).success).toBe(false);
    expect(diagramSchema.safeParse(withStep({ people: { BOSS: "x" } })).success).toBe(false);
    expect(diagramSchema.safeParse(withStep({ sla: "x".repeat(121) })).success).toBe(false);
    expect(diagramSchema.safeParse(withStep({}, { responsibility: "ABC" })).success).toBe(false);
  });
});
