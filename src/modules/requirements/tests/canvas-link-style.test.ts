import { beforeEach, describe, expect, it, vi } from "vitest";
import { execProc } from "@/lib/db";
import { PLAIN_STYLE } from "@/lib/connector-style";
import { setCanvasLinkStyle } from "../repository/canvases";
import { canvasLinkSchema, setCanvasLinkStyleInput } from "../schemas/canvas";

vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));

const proc = vi.mocked(execProc);

const input = {
  canvasId: 4,
  upstreamKind: "Requirement",
  upstreamId: 10,
  downstreamId: 11,
  style: { ...PLAIN_STYLE, shape: "curved", colour: "#2563EB", weight: 3, jumps: true },
  branchFromId: null,
  branchAt: null,
};

describe("link style input", () => {
  it("takes a full style and a plain one", () => {
    expect(setCanvasLinkStyleInput.safeParse(input).success).toBe(true);
    expect(setCanvasLinkStyleInput.safeParse({ ...input, style: PLAIN_STYLE }).success).toBe(true);
  });

  it("refuses a colour that is not a six-digit hex", () => {
    for (const colour of ["#fff' OR 1=1--", "#fff", "red", "#12345G", "#1234567"]) {
      const style = { ...input.style, colour };
      expect(setCanvasLinkStyleInput.safeParse({ ...input, style }).success).toBe(false);
    }
  });

  it("refuses an object or a number where a word belongs", () => {
    const bad = [
      { shape: { toString: () => "curved" } },
      { pattern: ["dashed"] },
      { startEnd: 1 },
      { colour: { hex: "#2563EB" } },
      { weight: "3" },
      { weight: 7 },
      { weight: 2.5 },
      { jumps: "true" },
      { sourceSide: "middle" },
    ];
    for (const part of bad) {
      const style = { ...input.style, ...part };
      expect(setCanvasLinkStyleInput.safeParse({ ...input, style }).success).toBe(false);
    }
  });

  it("refuses keys it does not know, at either level", () => {
    expect(setCanvasLinkStyleInput.safeParse({ ...input, projectId: 1 }).success).toBe(false);
    const style = { ...input.style, rowVer: 3 };
    expect(setCanvasLinkStyleInput.safeParse({ ...input, style }).success).toBe(false);
  });

  it("needs a parent line for a branch point, and never the line itself", () => {
    expect(setCanvasLinkStyleInput.safeParse({ ...input, branchAt: 40 }).success).toBe(false);
    const fromLabel = { ...input, branchFromId: 12, branchAt: null };
    expect(setCanvasLinkStyleInput.safeParse(fromLabel).success).toBe(true);
    const along = { ...input, branchFromId: 12, branchAt: 100 };
    expect(setCanvasLinkStyleInput.safeParse(along).success).toBe(true);
    expect(setCanvasLinkStyleInput.safeParse({ ...along, branchAt: 101 }).success).toBe(false);
    expect(setCanvasLinkStyleInput.safeParse({ ...input, branchFromId: 11 }).success).toBe(false);
  });
});

describe("link style write", () => {
  beforeEach(() => {
    proc.mockReset();
    proc.mockResolvedValue([{ ProjectId: 2 }]);
  });

  it("sends each value to its own typed proc parameter", async () => {
    const parsed = setCanvasLinkStyleInput.parse({ ...input, branchFromId: 12, branchAt: 30 });
    await expect(setCanvasLinkStyle(parsed, 9)).resolves.toBe(2);
    expect(proc).toHaveBeenCalledWith("usp_RequirementCanvasLink_SetStyle", {
      RequirementCanvasId: 4,
      UpstreamKind: "Requirement",
      UpstreamId: 10,
      DownstreamId: 11,
      LineShape: "curved",
      LinePattern: null,
      StartEnd: null,
      EndEnd: null,
      LineWeight: 3,
      LineColour: "#2563EB",
      Attach: null,
      SourceSide: null,
      TargetSide: null,
      Jumps: true,
      BranchFromId: 12,
      BranchAt: 30,
      ActorUserId: 9,
    });
  });
});

describe("link style read", () => {
  const row = {
    UpstreamKind: "Requirement",
    UpstreamId: 1,
    DownstreamId: 2,
    LinkStatus: "Active",
    RowVer: 5,
  };

  it("reads a link nobody styled as no style at all", () => {
    const link = canvasLinkSchema.parse({ ...row, LineShape: null, LineColour: null });
    expect(link.LineShape).toBeNull();
    expect(link.LineColour).toBeNull();
  });

  it("drops a stored colour that is not a hex instead of drawing it", () => {
    expect(canvasLinkSchema.parse({ ...row, LineColour: "url(#x)" }).LineColour).toBeNull();
    expect(canvasLinkSchema.parse({ ...row, LineColour: "#16A34A" }).LineColour).toBe("#16A34A");
  });
});
