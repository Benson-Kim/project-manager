import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { AppError } from "@/lib/errors";
import {
  createActionItemAction,
  createAgendaItemAction,
  createDiscussionPointAction,
  createMeetingAction,
  createMeetingDraftAction,
  deleteActionItemAction,
  deleteAgendaItemAction,
  deleteDiscussionPointAction,
  deleteMeetingAction,
  reorderActionItemsAction,
  reorderAgendaItemsAction,
  reorderDiscussionPointsAction,
  setParticipantsAction,
  updateActionItemAction,
  updateAgendaItemAction,
  updateDiscussionPointAction,
  updateMeetingAction,
} from "../actions";
import { meetingDbRow, scopeDbRow, workspaceDbRow } from "./fixtures";

const LIST = "/projects/[id]/meetings";
const WORKSPACE = "/projects/[id]/meetings/[meetingId]";

type Run = (input: unknown) => Promise<{ ok: boolean; error?: { code: string } }>;

const order = [
  { id: 2, rowVer: 5 },
  { id: 1, rowVer: 4 },
];

/** Every action: a valid input, the proc it calls first, what it answers, what it revalidates. */
const CASES: {
  name: string;
  run: Run;
  input: Record<string, unknown>;
  proc: string;
  answers: "meeting" | "deleted" | "workspace";
  revalidates: string[];
}[] = [
  {
    name: "createMeetingDraft",
    run: createMeetingDraftAction,
    input: { projectId: 24 },
    proc: "usp_Meeting_Create",
    answers: "meeting",
    revalidates: [LIST, WORKSPACE],
  },
  {
    name: "createMeeting",
    run: createMeetingAction,
    input: { projectId: "24", subject: "Weekly progress" },
    proc: "usp_Meeting_Create",
    answers: "meeting",
    revalidates: [LIST, WORKSPACE],
  },
  {
    name: "updateMeeting",
    run: updateMeetingAction,
    input: { meetingId: "2", rowVer: "1001", subject: "Weekly progress" },
    proc: "usp_Meeting_Update",
    answers: "meeting",
    revalidates: [LIST, WORKSPACE],
  },
  {
    name: "deleteMeeting",
    run: deleteMeetingAction,
    input: { meetingId: 2, rowVer: 1001 },
    proc: "usp_Meeting_Delete",
    answers: "deleted",
    revalidates: [LIST, WORKSPACE],
  },
  {
    name: "createAgendaItem",
    run: createAgendaItemAction,
    input: { meetingId: 2, agendaItem: "Budget" },
    proc: "usp_MeetingAgendaItem_Create",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "updateAgendaItem",
    run: updateAgendaItemAction,
    input: { meetingAgendaItemId: 1, rowVer: 4, agendaItem: "Budget" },
    proc: "usp_MeetingAgendaItem_Update",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "deleteAgendaItem",
    run: deleteAgendaItemAction,
    input: { meetingAgendaItemId: 1, rowVer: 4 },
    proc: "usp_MeetingAgendaItem_Delete",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "reorderAgendaItems",
    run: reorderAgendaItemsAction,
    input: { meetingId: 2, order },
    proc: "usp_MeetingAgendaItem_Reorder",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "createDiscussionPoint",
    run: createDiscussionPointAction,
    input: { agendaItemId: 1, discussionPoint: "<p>Over by 5%</p>" },
    proc: "usp_MeetingDiscussionPoint_Create",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "updateDiscussionPoint",
    run: updateDiscussionPointAction,
    input: { meetingDiscussionPointId: 1, rowVer: 4, discussionPoint: "<p>Over</p>" },
    proc: "usp_MeetingDiscussionPoint_Update",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "deleteDiscussionPoint",
    run: deleteDiscussionPointAction,
    input: { meetingDiscussionPointId: 1, rowVer: 4 },
    proc: "usp_MeetingDiscussionPoint_Delete",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "reorderDiscussionPoints",
    run: reorderDiscussionPointsAction,
    input: { agendaItemId: 1, order },
    proc: "usp_MeetingDiscussionPoint_Reorder",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "createActionItem",
    run: createActionItemAction,
    input: { agendaItemId: 1, action: "Book the room" },
    proc: "usp_MeetingActionItem_Create",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "updateActionItem",
    run: updateActionItemAction,
    input: {
      meetingActionItemId: 1,
      rowVer: 4,
      action: "Book the room",
      assignedToStakeholderId: 3,
    },
    proc: "usp_MeetingActionItem_Update",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "deleteActionItem",
    run: deleteActionItemAction,
    input: { meetingActionItemId: 1, rowVer: 4 },
    proc: "usp_MeetingActionItem_Delete",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "reorderActionItems",
    run: reorderActionItemsAction,
    input: { discussionPointId: 1, order },
    proc: "usp_MeetingActionItem_Reorder",
    answers: "workspace",
    revalidates: [],
  },
  {
    name: "setParticipants",
    run: setParticipantsAction,
    input: { meetingId: 2, stamp: 2004, participants: [{ stakeholderId: 3, isApology: true }] },
    proc: "usp_MeetingParticipant_Set",
    answers: "workspace",
    revalidates: [LIST],
  },
];

function answerProcs() {
  execProc.mockImplementation((proc: string) => {
    if (proc === "usp_Meeting_GetWorkspace") return Promise.resolve([workspaceDbRow()]);
    if (proc === "usp_Meeting_Delete") return Promise.resolve([]);
    if (proc.startsWith("usp_Meeting_")) return Promise.resolve([meetingDbRow()]);
    return Promise.resolve([scopeDbRow()]);
  });
}

describe("meetings actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  describe.each(CASES)("$name", ({ run, input, proc, answers, revalidates }) => {
    it("succeeds, as the session's user", async () => {
      answerProcs();
      const result = (await run(input)) as { ok: boolean; data?: unknown };
      expect(result.ok).toBe(true);
      const [firstProc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(firstProc).toBe(proc);
      expect(params.ActorUserId).toBe(7);
      if (answers === "meeting") expect(result.data).toMatchObject({ MeetingId: 2 });
      if (answers === "deleted") expect(result.data).toEqual({ deleted: true });
      if (answers === "workspace") {
        expect(execProc.mock.calls[1]).toEqual([
          "usp_Meeting_GetWorkspace",
          { MeetingId: 2, ActorUserId: 7 },
        ]);
        expect(result.data).toMatchObject({ meeting: { MeetingId: 2 }, participantsStamp: 2004 });
      }
      expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(revalidates);
    });

    it("answers VALIDATION for an empty input without calling a proc", async () => {
      const result = await run({});
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("VALIDATION");
      expect(execProc).not.toHaveBeenCalled();
    });

    it("surfaces the proc's FORBIDDEN_ROW", async () => {
      execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "no"));
      const result = await run(input);
      expect(result.error?.code).toBe("FORBIDDEN_ROW");
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("hides an unexpected proc failure behind INTERNAL", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      execProc.mockRejectedValue(new Error("socket hang up"));
      const result = await run(input);
      expect(result.error?.code).toBe("INTERNAL");
    });

    it("needs a session", async () => {
      session = null;
      const result = await run(input);
      expect(result.error?.code).toBe("UNAUTHENTICATED");
      expect(execProc).not.toHaveBeenCalled();
    });
  });

  it("maps a stale stamp on a participant save to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "modified"));
    const result = await setParticipantsAction({ meetingId: 2, stamp: 1, participants: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("puts a title error on the subject field from FormData", async () => {
    const fd = new FormData();
    fd.set("meetingId", "2");
    fd.set("rowVer", "1001");
    fd.set("subject", " ");
    fd.set("startTime", "10:00");
    fd.set("endTime", "09:00");
    const result = await updateMeetingAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.error.fieldErrors ?? {}).sort()).toEqual(["endTime", "subject"]);
    }
  });

  it("refuses an action with no parent before reaching the proc", async () => {
    const result = await createActionItemAction({ action: "Orphan" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors?.agendaItemId).toBeDefined();
    expect(execProc).not.toHaveBeenCalled();
  });
});
