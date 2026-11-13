import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("link and save status guardrails", () => {
  it("never underlines a link for good; only hover may underline", () => {
    const always = /(?<![\w:-])underline(?![\w-])/;
    const offenders = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx") && !file.includes("editor-toolbar"))
      .flatMap((file) =>
        source(join("src", file))
          .split("\n")
          .filter((line) => line.includes("className") && always.test(line))
          .map((line) => `${file}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("shows autosave as a dot rather than words that come and go", () => {
    for (const file of [
      "src/modules/bpmn/components/bpmn-workspace.tsx",
      "src/modules/key-deliverables/components/wbs-toolbar.tsx",
      "src/components/ui/note-popover.tsx",
    ]) {
      expect(source(file), file).toContain("<SaveDot");
    }
    expect(source("src/components/ui/note-popover.tsx")).not.toContain("messages.feedback.saved");
  });
});
