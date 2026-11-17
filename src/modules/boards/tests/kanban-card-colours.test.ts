import { describe, expect, it } from "vitest";
import { kanbanDescriptionClass, kanbanTitleClass } from "../components/kanban-card";

describe("kanban card colours", () => {
  it("gives the title and the description different colours", () => {
    const title = kanbanTitleClass.split(" ");
    const description = kanbanDescriptionClass.split(" ");
    expect(title).toContain("text-accent-strong");
    expect(description).toContain("text-ink-muted");
    expect(title).not.toContain("text-ink-muted");
    expect(description).not.toContain("text-accent-strong");
  });
});
