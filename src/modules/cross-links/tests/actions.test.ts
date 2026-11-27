import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";

const mockExecProc = vi.hoisted(() => vi.fn());
const mockRequireSession = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockRefuseIfReadOnly = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    execProc: mockExecProc,
  };
});

vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: mockGetSession,
    requireSession: mockRequireSession,
  },
}));

vi.mock("@/lib/licence/write-check", () => ({
  refuseIfReadOnly: mockRefuseIfReadOnly,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import {
  createCrossLinkAction,
  createPageNoteAction,
  deleteCrossLinkAction,
  listLocationStickiesAction,
  updateCrossLinkAction,
} from "../actions";

const SAMPLE_LINK_ROW = {
  CrossLinkId: 11,
  Side: "A",
  EndAModule: "board",
  EndAProjectId: 9,
  EndAEntityId: 5,
  EndASubEntityId: null,
  EndAAnchorKind: "page",
  EndAAnchorKey: null,
  EndALabel: "Sprint board",
  EndBModule: "decisions",
  EndBProjectId: 2,
  EndBEntityId: 33,
  EndBSubEntityId: null,
  EndBAnchorKind: "record",
  EndBAnchorKey: "row:33",
  EndBLabel: "Decision 33",
  LinkTitle: "Follow-up",
  NoteText: null,
  Color: "blue",
  CreatedBy: 4,
  CreatedAtUtc: "2026-11-27T09:00:00Z",
  UpdatedAtUtc: null,
  RowVer: 3,
};

const SAMPLE_NOTE_ROW = {
  PageNoteId: 21,
  ModuleKey: "board",
  ProjectId: 9,
  EntityId: 5,
  SubEntityId: null,
  AnchorKind: "page",
  AnchorKey: null,
  AnchorLabel: "Sprint board",
  Body: "Review blockers at 10am",
  Color: "yellow",
  CreatedBy: 4,
  CreatedAtUtc: "2026-11-27T09:05:00Z",
  UpdatedAtUtc: null,
  RowVer: 1,
};

describe("cross-links server actions, repository parameter whitelists, and licence policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockGetSession.mockResolvedValue({ userId: 4, role: "User", username: "contrib" });
    mockRequireSession.mockResolvedValue({ userId: 4, role: "User", username: "contrib" });
    mockRefuseIfReadOnly.mockResolvedValue(false);
  });

  it("allows listLocationStickiesAction in read-only licence mode and heals hrefs with live project ids", async () => {
    mockRefuseIfReadOnly.mockResolvedValue(true);
    mockExecProc.mockImplementation(async (proc: string) => {
      if (proc === "usp_CrossLink_ListForLocation") return [SAMPLE_LINK_ROW];
      if (proc === "usp_PageNote_ListForLocation") return [SAMPLE_NOTE_ROW];
      return [];
    });

    const res = await listLocationStickiesAction({
      moduleKey: "board",
      projectId: 9,
      entityId: 5,
    });

    expect(mockRefuseIfReadOnly).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.links[0]?.endA.href).toBe("/projects/9/boards/5");
    expect(res.data.links[0]?.endB.href).toBe("/projects/2/decisions?id=33#cl-row:33");
    expect(res.data.links[0]?.there.href).toBe("/projects/2/decisions?id=33#cl-row:33");
    expect(res.data.notes[0]?.href).toBe("/projects/9/boards/5");
  });

  it("calls usp_CrossLink_Create with exact named parameters and revalidates both live endpoints", async () => {
    mockExecProc.mockResolvedValue([SAMPLE_LINK_ROW]);

    const res = await createCrossLinkAction({
      endA: {
        moduleKey: "board",
        projectId: 2,
        entityId: 5,
        subEntityId: null,
        anchorKind: "page",
        anchorKey: null,
        label: "Sprint board",
      },
      endB: {
        moduleKey: "decisions",
        projectId: 2,
        entityId: 33,
        subEntityId: null,
        anchorKind: "record",
        anchorKey: "row:33",
        label: "Decision 33",
      },
      linkTitle: "Follow-up",
      noteText: null,
      color: "blue",
    });

    expect(mockRefuseIfReadOnly).toHaveBeenCalledTimes(1);
    expect(mockExecProc).toHaveBeenCalledWith("usp_CrossLink_Create", {
      EndAModule: "board",
      EndAProjectId: 2,
      EndAEntityId: 5,
      EndASubEntityId: null,
      EndAAnchorKind: "page",
      EndAAnchorKey: null,
      EndALabel: "Sprint board",
      EndBModule: "decisions",
      EndBProjectId: 2,
      EndBEntityId: 33,
      EndBSubEntityId: null,
      EndBAnchorKind: "record",
      EndBAnchorKey: "row:33",
      EndBLabel: "Decision 33",
      LinkTitle: "Follow-up",
      NoteText: null,
      Color: "blue",
      ActorUserId: 4,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/projects/9/boards/5");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/projects/2/decisions");
    expect(res.ok).toBe(true);
  });

  it("maps SQL ADR-0040 NOT_FOUND and RowVer CONFLICT cleanly on update/delete", async () => {
    mockExecProc.mockRejectedValueOnce(new AppError("NOT_FOUND", "Cross-link target not found"));
    const nf = await updateCrossLinkAction({
      crossLinkId: 99,
      linkTitle: "Hidden",
      noteText: null,
      color: "yellow",
      rowVer: 1,
    });
    expect(nf.ok).toBe(false);
    if (!nf.ok) expect(nf.error.code).toBe("NOT_FOUND");

    mockExecProc.mockRejectedValueOnce(new AppError("CONFLICT", "Stale rowver"));
    const cf = await deleteCrossLinkAction({ crossLinkId: 11, rowVer: 1 });
    expect(cf.ok).toBe(false);
    if (!cf.ok) expect(cf.error.code).toBe("CONFLICT");
  });

  it("refuses mutations when licence is read-only", async () => {
    mockRefuseIfReadOnly.mockResolvedValue(true);
    const blocked = await updateCrossLinkAction({
      crossLinkId: 11,
      linkTitle: "Blocked",
      noteText: null,
      color: "yellow",
      rowVer: 1,
    });
    expect(blocked.ok).toBe(false);
    expect(mockExecProc).not.toHaveBeenCalled();
  });

  it("rejects XSS markup at action boundary without touching the database", async () => {
    const res = await createPageNoteAction({
      moduleKey: "dashboard",
      projectId: null,
      entityId: null,
      subEntityId: null,
      anchorKind: "page",
      anchorKey: null,
      anchorLabel: "Dashboard",
      body: "<svg onload=alert(1)>",
      color: "yellow",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION");
    expect(mockExecProc).not.toHaveBeenCalled();
  });
});
