import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findMatches, textRuns } from "../rich-text/find-matches";

function fakeDoc(nodes: { text?: string; pos: number }[]) {
  return {
    descendants: (cb: Parameters<PMNode["descendants"]>[0]) => {
      for (const n of nodes)
        cb({ isText: n.text !== undefined, text: n.text } as PMNode, n.pos, null, 0);
    },
  };
}

describe("textRuns", () => {
  it("joins adjacent text nodes and keeps separate blocks apart", () => {
    const doc = fakeDoc([
      { pos: 0 },
      { text: "Hel", pos: 1 },
      { text: "lo", pos: 4 },
      { text: "Bye", pos: 8 },
    ]);
    expect(textRuns(doc)).toEqual([
      { text: "Hello", pos: 1 },
      { text: "Bye", pos: 8 },
    ]);
  });
});

describe("findMatches", () => {
  it("finds every match, ignoring case, at document positions", () => {
    const runs = [
      { text: "Risk and risk", pos: 1 },
      { text: "RISK", pos: 20 },
    ];
    expect(findMatches(runs, "risk")).toEqual([
      { from: 1, to: 5 },
      { from: 10, to: 14 },
      { from: 20, to: 24 },
    ]);
  });

  it("treats pattern characters literally", () => {
    expect(findMatches([{ text: "a.b axb (c)", pos: 0 }], "a.b")).toEqual([{ from: 0, to: 3 }]);
    expect(findMatches([{ text: "(c)", pos: 0 }], "(c)")).toEqual([{ from: 0, to: 3 }]);
  });

  it("finds nothing for an empty query", () => {
    expect(findMatches([{ text: "abc", pos: 0 }], "")).toEqual([]);
  });
});
