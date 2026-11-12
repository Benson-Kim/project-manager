import { describe, expect, it } from "vitest";
import { messages } from "../lib/messages";

/**
 * Guardrail: one tone — short, sentence case, no exclamation
 * marks, no jargon markers. Walks every leaf including message functions.
 */
function collectStrings(node: unknown, path: string): Array<[string, string]> {
  if (typeof node === "string") return [[path, node]];
  if (typeof node === "function") return probe(node as (...args: unknown[]) => string, path);
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      collectStrings(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/**
 * Representative arguments for message functions, one set of probes per argument shape. A
 * function is probed with the first shape it accepts; one that accepts none fails the run by
 * name, so no message escapes the checks unnoticed.
 */
const PROBE_SHAPES: unknown[][][] = [
  [
    [1, 1],
    [2, "records"],
    [3, 10],
  ],
  [
    ["Accountable", ["Ada Lovelace"]],
    ["Accountable", ["Ada Lovelace", "Alan Turing"]],
  ],
];

function probe(fn: (...args: unknown[]) => string, path: string): Array<[string, string]> {
  for (const probes of PROBE_SHAPES) {
    try {
      return probes.map((args, i) => [`${path}(probe ${i})`, fn(...args)]);
    } catch {
      continue;
    }
  }
  throw new Error(`${path}: no probe shape fits this message function; add one to PROBE_SHAPES`);
}

/** Notations written in capitals, which are not shouting: the BPMN name and the date format. */
const NOTATIONS = /\bBPMN\b|\bYYYY-MM-DD\b/g;

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
    expect(value.replace(NOTATIONS, "")).not.toMatch(/\b[A-Z]{4,}\b/);
  });
});
