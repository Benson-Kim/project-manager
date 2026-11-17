import { describe, expect, it } from "vitest";
import { consentChoices, nameAllowed } from "../licence/consent";
import { reasonText, statusText, type LicenceView } from "../licence/licence-text";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 17, 12);
const view = (over: Partial<LicenceView>): LicenceView => ({
  ok: true,
  status: "active",
  kind: "trial",
  expiresAt: null,
  updatesUntil: null,
  now: NOW,
  ...over,
});

describe("licence status text", () => {
  it.each([
    [NOW + 14 * DAY, "Trial: 14 days left."],
    [NOW + 13 * DAY + 1, "Trial: 14 days left."],
    [NOW + DAY, "Trial: 1 day left."],
    [NOW + 1000, "Trial: 1 day left."],
  ])("counts trial days up from the trusted now (%i)", (expiresAt, text) => {
    expect(statusText(view({ expiresAt }))).toBe(text);
  });

  it("ignores the PC clock", () => {
    expect(statusText(view({ expiresAt: Date.now() + 2 * DAY, now: Date.now() - 30 * DAY }))).toBe(
      "Trial: 32 days left.",
    );
  });

  it.each([
    [
      view({ kind: "full", updatesUntil: Date.UTC(2027, 10, 17) }),
      "Licensed. Updates until 2027-11-17.",
    ],
    [
      view({ kind: "free", updatesUntil: Date.UTC(2027, 10, 17) }),
      "Free licence. Updates until 2027-11-17.",
    ],
    [view({ kind: "full" }), "Licensed."],
    [view({ status: "expired" }), "Your trial has ended. You can still view and export your work."],
    [
      view({ status: "expired", kind: "full" }),
      "Your licence has ended. You can still view and export your work.",
    ],
    [view({ status: "unlicensed", kind: null }), "Start a 14-day trial, or enter a licence code."],
    [view({ status: "off", kind: null }), ""],
  ])("describes %j", (state, text) => {
    expect(statusText(state)).toBe(text);
  });

  it("keeps view and export in the reconnect text", () => {
    expect(statusText(view({ status: "reconnect" }))).toContain("view and export");
  });
});

describe("licence reason text", () => {
  it.each([
    ["offline", "Couldn't reach the licence service. Check the connection and try again."],
    ["failed", "Couldn't reach the licence service. Check the connection and try again."],
    ["invalid_code", "That code didn't work."],
    ["invalid_input", "That code didn't work."],
    ["rate_limited", "Too many tries. Wait a few minutes."],
    ["already_licensed", "This PC already has a licence."],
    ["forbidden", "Something went wrong."],
    ["anything-else", "Something went wrong."],
  ])("maps %s", (reason, text) => {
    expect(reasonText(reason)).toBe(text);
  });
});

describe("feedback consent", () => {
  const form = { testimonial: false, named: false, quote: "", displayName: "" };

  it("allows the name tick only with a ticked, non-empty quote", () => {
    expect(nameAllowed({ testimonial: false, quote: "Great" })).toBe(false);
    expect(nameAllowed({ testimonial: true, quote: "   " })).toBe(false);
    expect(nameAllowed({ testimonial: true, quote: "Great" })).toBe(true);
  });

  it("withdraws both consents when both are unticked", () => {
    expect(consentChoices({ ...form, quote: "old", displayName: "Old" })).toEqual({
      choices: [
        { kind: "testimonial", granted: false, quote: "", displayName: null },
        { kind: "name", granted: false, quote: "", displayName: null },
      ],
    });
  });

  it("grants the two consents separately", () => {
    expect(
      consentChoices({ testimonial: true, named: false, quote: " Great ", displayName: "Ann" }),
    ).toEqual({
      choices: [
        { kind: "testimonial", granted: true, quote: "Great", displayName: null },
        { kind: "name", granted: false, quote: "", displayName: null },
      ],
    });
    expect(
      consentChoices({ testimonial: true, named: true, quote: "Great", displayName: " Ann " }),
    ).toEqual({
      choices: [
        { kind: "testimonial", granted: true, quote: "Great", displayName: null },
        { kind: "name", granted: true, quote: "", displayName: "Ann" },
      ],
    });
  });

  it("never grants the name without a quote", () => {
    const result = consentChoices({
      testimonial: false,
      named: true,
      quote: "",
      displayName: "Ann",
    });
    expect(result).toEqual({
      choices: [
        { kind: "testimonial", granted: false, quote: "", displayName: null },
        { kind: "name", granted: false, quote: "", displayName: null },
      ],
    });
  });

  it.each([
    [{ ...form, testimonial: true }, "Write the words you're happy for us to quote."],
    [{ ...form, testimonial: true, quote: "Great", named: true }, "Enter the name to show."],
  ])("refuses an incomplete form %j", (input, error) => {
    expect(consentChoices(input)).toEqual({ error });
  });
});
