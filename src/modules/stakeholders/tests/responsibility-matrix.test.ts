import { describe, expect, it } from "vitest";
import {
  RESPONSIBILITY_FRAMEWORK_CODES,
  responsibilityFramework,
  type ResponsibilityFrameworkCode,
} from "../schemas/responsibility-frameworks";
import {
  cellKey,
  cellRowSchema,
  matrixRowSchema,
  rowFlags,
  setCellInput,
} from "../schemas/responsibility-matrix";

interface Vector {
  required: string[];
  valid: string[];
  doubled: string[];
}

const VECTORS: Record<ResponsibilityFrameworkCode, Vector> = {
  RACI: {
    required: ["RESPONSIBLE", "ACCOUNTABLE"],
    valid: ["RESPONSIBLE", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"],
    doubled: ["ACCOUNTABLE"],
  },
  DACI: {
    required: ["DRIVER", "APPROVER"],
    valid: ["DRIVER", "APPROVER", "CONTRIBUTOR", "CONTRIBUTOR"],
    doubled: ["DRIVER", "APPROVER"],
  },
  RAPID: {
    required: ["DECIDE"],
    valid: ["RECOMMEND", "AGREE", "PERFORM", "INPUT", "DECIDE"],
    doubled: ["DECIDE"],
  },
  DARE: {
    required: ["DECIDER"],
    valid: ["DECIDER", "DECIDER", "ADVISOR", "EXECUTION"],
    doubled: [],
  },
  RASCI: {
    required: ["RESPONSIBLE", "ACCOUNTABLE"],
    valid: ["RESPONSIBLE", "ACCOUNTABLE", "SUPPORT", "SUPPORT"],
    doubled: ["ACCOUNTABLE"],
  },
  RACI_VS: {
    required: ["RESPONSIBLE", "ACCOUNTABLE"],
    valid: ["RESPONSIBLE", "ACCOUNTABLE"],
    doubled: ["ACCOUNTABLE"],
  },
  ARPA: {
    required: ["ACCOUNTABLE"],
    valid: ["ACCOUNTABLE", "RESPONSIBLE", "PARTICIPANT", "ADVISOR"],
    doubled: ["ACCOUNTABLE"],
  },
  MOCHA: {
    required: ["MANAGER", "OWNER"],
    valid: ["MANAGER", "OWNER", "HELPER", "APPROVER"],
    doubled: ["MANAGER", "OWNER", "APPROVER"],
  },
  RATSI: {
    required: ["RESPONSIBLE", "AUTHORITY"],
    valid: ["RESPONSIBLE", "RESPONSIBLE", "AUTHORITY", "TASK", "SUPPORT"],
    doubled: ["AUTHORITY"],
  },
};

describe("rowFlags", () => {
  it("has a vector for every framework", () => {
    expect(Object.keys(VECTORS).sort()).toEqual([...RESPONSIBILITY_FRAMEWORK_CODES].sort());
  });

  describe.each(RESPONSIBILITY_FRAMEWORK_CODES)("%s", (code) => {
    const framework = responsibilityFramework(code);
    const v = VECTORS[code];

    it("flags every required role on an empty row", () => {
      expect(rowFlags(framework, [])).toEqual({ missing: v.required, duplicated: [] });
    });

    it("passes a valid row", () => {
      expect(rowFlags(framework, v.valid)).toEqual({ missing: [], duplicated: [] });
    });

    it("flags one-per-row roles held twice", () => {
      const row = [...v.required, ...v.doubled, ...v.doubled];
      expect(rowFlags(framework, row)).toEqual({ missing: [], duplicated: v.doubled });
    });

    it("ignores codes from other frameworks", () => {
      expect(rowFlags(framework, [...v.valid, "NOT_A_ROLE"])).toEqual({
        missing: [],
        duplicated: [],
      });
    });
  });
});

describe("cellKey", () => {
  it("keys WBS and decision rows apart", () => {
    expect(cellKey({ kind: "WbsItem", keyDeliverableId: 12 }, 7)).toBe("W:12:7");
    expect(cellKey({ kind: "Decision", decisionId: 3 }, 7)).toBe("D:3:7");
    expect(cellKey({ kind: "WbsItem", keyDeliverableId: 3 }, 7)).not.toBe(
      cellKey({ kind: "Decision", decisionId: 3 }, 7),
    );
  });
});

describe("row schemas", () => {
  it("maps a cell row to a WBS or decision ref", () => {
    const base = { StakeholderId: 7, RoleCode: "RESPONSIBLE", IsMember: true };
    expect(cellRowSchema.parse({ ...base, KeyDeliverableId: 12, DecisionId: null }).row).toEqual({
      kind: "WbsItem",
      keyDeliverableId: 12,
    });
    expect(cellRowSchema.parse({ ...base, KeyDeliverableId: null, DecisionId: 3 }).row).toEqual({
      kind: "Decision",
      decisionId: 3,
    });
  });

  it("rejects a cell on both or neither row kind", () => {
    const base = { StakeholderId: 7, RoleCode: "R", IsMember: false };
    expect(() => cellRowSchema.parse({ ...base, KeyDeliverableId: 1, DecisionId: 2 })).toThrow();
    expect(() =>
      cellRowSchema.parse({ ...base, KeyDeliverableId: null, DecisionId: null }),
    ).toThrow();
  });

  it("rejects an unknown framework code", () => {
    const row = {
      ResponsibilityMatrixId: 1,
      ProjectId: 2,
      Name: "M",
      FrameworkCode: "NOPE",
      RowKind: "WbsItem",
      MemberCount: 0,
      CreatedAtUtc: "2026-11-10T00:00:00Z",
      UpdatedAtUtc: null,
      RowVer: "5",
    };
    expect(() => matrixRowSchema.parse(row)).toThrow();
    expect(matrixRowSchema.parse({ ...row, FrameworkCode: "RACI" }).rowVer).toBe(5);
  });

  it("allows a cell to be cleared but not a blank role", () => {
    const base = {
      projectId: 1,
      matrixId: 2,
      row: { kind: "WbsItem", keyDeliverableId: 3 },
      stakeholderId: 4,
      expectedRoleCode: "RESPONSIBLE",
    };
    expect(setCellInput.parse({ ...base, roleCode: null }).roleCode).toBeNull();
    expect(() => setCellInput.parse({ ...base, roleCode: "  " })).toThrow();
  });
});
