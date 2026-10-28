import { describe, expect, it, vi } from "vitest";
import { contextMenuTemplate, type ContextMenuState } from "../context-menu";
import { GrammarChecker, type WorkerLike } from "../grammar";
import {
  dialectFor,
  grammarFixes,
  spellingLanguage,
  toIssues,
  writtenEnglish,
  type GrammarIssue,
  type LintLike,
} from "../proofing";

function lint(
  kind: string,
  start: number,
  end: number,
  problem: string,
  fixes: [number, string][],
): LintLike {
  return {
    lint_kind: () => kind,
    message: () => `${kind} message`,
    get_problem_text: () => problem,
    span: () => ({ start, end }),
    suggestions: () =>
      fixes.map(([k, text]) => ({ kind: () => k, get_replacement_text: () => text })),
  };
}

describe("toIssues", () => {
  it("leaves spelling to the spell checker and turns each fix into the resulting text", () => {
    const text = "We was here, the the end";
    const issues = toIssues(text, [
      lint("Agreement", 3, 6, "was", [[0, "were"]]),
      lint("Spelling", 0, 2, "We", [[0, "Wee"]]),
      lint("Repetition", 13, 20, "the the", [
        [0, "the"],
        [1, ""],
      ]),
      lint("Punctuation", 7, 11, "here", [[2, "!"]]),
    ]);
    expect(issues.map((i) => [i.problem, i.fixes])).toEqual([
      ["was", ["were"]],
      ["the the", ["the", ""]],
      ["here", ["here!"]],
    ]);
  });

  it("counts characters the way the page does, past an emoji", () => {
    const text = "😀 we was";
    const [issue] = toIssues(text, [lint("Agreement", 5, 8, "was", [[0, "were"]])]);
    expect(text.slice(issue.start, issue.end)).toBe("was");
  });

  it("drops a problem whose only fix changes nothing", () => {
    expect(toIssues("ok", [lint("Style", 0, 2, "ok", [[0, "ok"]])])).toEqual([]);
  });
});

describe("grammarFixes", () => {
  const issue = (start: number, problem: string, fixes: string[]): GrammarIssue => ({
    start,
    end: start + problem.length,
    problem,
    message: "",
    fixes,
  });

  it("puts the problem under the caret first and labels a deletion", () => {
    const fixes = grammarFixes([issue(0, "was", ["were"]), issue(20, "the the", ["the", ""])], 22);
    expect(fixes.map((f) => f.label)).toEqual([
      "“the the” → “the”",
      "Delete “the the”",
      "“was” → “were”",
    ]);
  });

  it("keeps the menu short and escapes the menu's & marker", () => {
    const many = Array.from({ length: 5 }, (_, i) => issue(i * 10, "a & b", ["x", "y", "z"]));
    const fixes = grammarFixes(many, 0);
    expect(fixes).toHaveLength(6);
    expect(fixes[0].label).toBe("“a && b” → “x”");
  });
});

describe("languages", () => {
  it("writes the user's first English, else British", () => {
    expect(writtenEnglish(["sw-KE", "en-KE", "en-US"])).toBe("en-KE");
    expect(writtenEnglish(["fr-FR"])).toBe("en-GB");
  });

  it("spells in that English when there is a dictionary, else British", () => {
    expect(spellingLanguage("en-us", ["en-GB", "en-US"])).toBe("en-US");
    expect(spellingLanguage("en-KE", ["en-GB", "en-US"])).toBe("en-GB");
    expect(spellingLanguage("en-KE", ["fr"])).toBeNull();
  });

  it("checks grammar in the matching English", () => {
    expect(dialectFor("en-US")).toBe("American");
    expect(dialectFor("en-au")).toBe("Australian");
    expect(dialectFor("en-KE")).toBe("British");
  });
});

describe("contextMenuTemplate", () => {
  const noop = () => {};
  const actions = {
    replaceMisspelling: noop,
    addToDictionary: noop,
    copyLink: noop,
    setChecking: vi.fn(),
  };
  const base: ContextMenuState = {
    isEditable: true,
    checkable: true,
    hasSelection: false,
    linkURL: "",
    misspelledWord: "",
    dictionarySuggestions: [],
    editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
    checking: true,
    grammar: [],
  };
  const labels = (s: Partial<ContextMenuState>) =>
    contextMenuTemplate({ ...base, ...s }, actions).map((i) => i.label ?? i.role ?? i.type);

  it("offers spellings, the dictionary, grammar, editing, then the switch", () => {
    expect(
      labels({
        misspelledWord: "tomorow",
        dictionarySuggestions: ["tomorrow"],
        grammar: [{ label: "“was” → “were”", apply: noop }],
      }),
    ).toEqual([
      "tomorrow",
      "Add to dictionary",
      "separator",
      "“was” → “were”",
      "separator",
      "cut",
      "copy",
      "paste",
      "separator",
      "selectAll",
      "separator",
      "Check spelling and grammar",
    ]);
  });

  it("says when grammar is still loading, and offers none when checking is off", () => {
    expect(labels({ grammar: "loading" })[0]).toBe("Grammar check is loading…");
    expect(labels({ grammar: "loading", checking: false })).not.toContain(
      "Grammar check is loading…",
    );
  });

  it("gives a page only Copy and Copy link, and a field that opts out no switch", () => {
    expect(labels({ isEditable: false, hasSelection: true, linkURL: "https://x" })).toEqual([
      "copy",
      "separator",
      "Copy link",
    ]);
    expect(labels({ isEditable: false })).toEqual([]);
    expect(labels({ checkable: false })).not.toContain("Check spelling and grammar");
  });

  it("turns checking off from the switch", () => {
    const item = contextMenuTemplate(base, actions).at(-1)!;
    (item.click as () => void)();
    expect(actions.setChecking).toHaveBeenCalledWith(false);
  });
});

describe("GrammarChecker", () => {
  function fakeWorker() {
    const sent: unknown[] = [];
    let onMessage: (m: unknown) => void = () => {};
    let onExit: (code: number) => void = () => {};
    const worker: WorkerLike = {
      postMessage: (m) => void sent.push(m),
      kill: () => true,
      onMessage: (l) => void (onMessage = l),
      onExit: (l) => void (onExit = l),
    };
    return {
      worker,
      sent,
      reply: (m: unknown) => onMessage(m),
      exit: (code: number) => onExit(code),
    };
  }

  const make = (fake: ReturnType<typeof fakeWorker>, warn = vi.fn()) =>
    new GrammarChecker({
      fork: () => fake.worker,
      readWasm: async () => new Uint8Array([1]),
      dialect: "British",
      warn,
      checkTimeoutMs: 20,
    });

  it("answers null until the checker has loaded, then the problems", async () => {
    const fake = fakeWorker();
    const checker = make(fake);
    expect(await checker.check("We was")).toBeNull();
    fake.reply({ ready: true });
    const pending = checker.check("We was");
    const { id } = fake.sent.at(-1) as { id: number };
    fake.reply({ id, issues: [{ problem: "was" }] });
    expect(await pending).toEqual([{ problem: "was" }]);
    checker.stop();
  });

  it("answers null when the checker is slow or stops, and logs a crash", async () => {
    const fake = fakeWorker();
    const warn = vi.fn();
    const checker = make(fake, warn);
    checker.warm();
    fake.reply({ ready: true });
    expect(await checker.check("slow")).toBeNull();
    const cut = checker.check("cut off");
    fake.exit(3);
    expect(await cut).toBeNull();
    expect(warn).toHaveBeenCalledWith("[grammar] checker stopped (exit 3)");
    checker.stop();
  });
});
