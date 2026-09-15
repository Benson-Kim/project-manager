import { describe, expect, it } from "vitest";
import { messages } from "../lib/messages";

/**
 * Guardrail (ADR-0008): one tone — short, sentence case, no exclamation
 * marks, no jargon markers. Walks every leaf including message functions.
 */
function collectStrings(node: unknown, path: string): Array<[string, string]> {
  if (typeof node === "string") return [[path, node]];
  if (typeof node === "function") {
    const fn = node as (...args: never[]) => string;
    // Probe message functions with representative arguments.
    const probes: Array<[unknown, unknown]> = [
      [1, 1],
      [2, "records"],
      [3, 10],
    ];
    return probes.map((args, i) => [
      `${path}(probe ${i})`,
      fn(...(args as never[])),
    ]);
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      collectStrings(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const allStrings = collectStrings(messages, "");

describe("messages tone guardrail", () => {
  it("collects strings", () => {
    expect(allStrings.length).toBeGreaterThan(30);
  });

  it.each(allStrings)("%s has no exclamation mark", (_path, value) => {
    expect(value).not.toContain("!");
  });

  it.each(allStrings)("%s is short (max 90 chars)", (_path, value) => {
    expect(value.length).toBeLessThanOrEqual(90);
  });

  it.each(allStrings)("%s avoids shouty all-caps words", (_path, value) => {
    expect(value).not.toMatch(/\b[A-Z]{4,}\b/);
  });
});
