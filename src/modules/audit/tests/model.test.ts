import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { actorText, diffAudit, entityText, humanize } from "../model";

const A = messages.settings.audit;

describe("humanize", () => {
  it("drops the schema and spells the name out", () => {
    expect(humanize("app.MeetingActionItem")).toBe("Meeting action item");
    expect(humanize("auth.User")).toBe("User");
    expect(humanize("SetPassword")).toBe("Set password");
    expect(humanize("Create")).toBe("Create");
  });

  it("keeps an acronym's capitals", () => {
    expect(humanize("NFR")).toBe("NFR");
    expect(humanize("app.RACIEntry")).toBe("RACI entry");
    expect(humanize("ParentRequirementId")).toBe("Parent requirement id");
  });
});

describe("actorText", () => {
  it("names the person, falling back to the username", () => {
    expect(actorText({ ActorUserId: 4, ActorName: "Ann Lee", ActorUsername: "ann" })).toBe(
      "Ann Lee",
    );
    expect(actorText({ ActorUserId: 4, ActorName: null, ActorUsername: "ann" })).toBe("ann");
  });

  it("reads System when no one was signed in, and the id of a user who is gone", () => {
    expect(actorText({ ActorUserId: null, ActorName: null, ActorUsername: null })).toBe(A.system);
    expect(actorText({ ActorUserId: 9, ActorName: null, ActorUsername: null })).toBe(
      A.formerUser(9),
    );
  });
});

describe("entityText", () => {
  it("names the record's kind and id", () => {
    expect(entityText({ EntityName: "app.KeyDeliverable", EntityId: "12" })).toBe(
      "Key deliverable #12",
    );
    expect(entityText({ EntityName: "auth.User", EntityId: null })).toBe("User");
  });
});

describe("diffAudit", () => {
  it("lines up before and after and marks what changed", () => {
    expect(
      diffAudit(
        '{"Title":"Old","Number":3,"Done":false}',
        '{"Title":"New","Number":3,"Done":true}',
      ),
    ).toEqual([
      { field: "Title", before: "Old", after: "New", changed: true },
      { field: "Number", before: "3", after: "3", changed: false },
      { field: "Done", before: "false", after: "true", changed: true },
    ]);
  });

  it("shows every field as new on a create and as gone on a delete", () => {
    expect(diffAudit(null, '{"Title":"A"}')).toEqual([
      { field: "Title", before: null, after: "A", changed: true },
    ]);
    expect(diffAudit('{"Title":"A"}', null)).toEqual([
      { field: "Title", before: "A", after: null, changed: true },
    ]);
  });

  it("adds the fields only the after side has, after the others", () => {
    expect(diffAudit('{"A":1}', '{"A":1,"B":null,"C":"x"}').map((r) => r.field)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("treats a missing field and a null one alike", () => {
    expect(diffAudit('{"Email":null}', "{}")).toEqual([
      { field: "Email", before: null, after: null, changed: false },
    ]);
  });

  it("keeps nested values and text that is not a JSON object", () => {
    expect(diffAudit('{"Tags":["a","b"]}', null)[0]?.before).toBe('["a","b"]');
    expect(diffAudit("not json", null)).toEqual([
      { field: "value", before: "not json", after: null, changed: true },
    ]);
    expect(diffAudit("[1,2]", "7")).toEqual([
      { field: "value", before: "[1,2]", after: "7", changed: true },
    ]);
  });

  it("is empty when nothing was recorded", () => {
    expect(diffAudit(null, null)).toEqual([]);
    expect(diffAudit("", "  ")).toEqual([]);
  });

  it("returns values as text only, markup included", () => {
    const [row] = diffAudit(null, '{"Description":"<img src=x onerror=alert(1)>"}');
    expect(row?.after).toBe("<img src=x onerror=alert(1)>");
  });
});
