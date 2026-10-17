import { describe, expect, it } from "vitest";
import { ratesByYear, sameEveryYear, stepsFromRates } from "../calc/tax-rates";

const years = [2023, 2024, 2025, 2026];

describe("tax rates by fiscal year", () => {
  it("spreads a rate and its steps over the years, each step from its year on", () => {
    expect(ratesByYear("5", [], years)).toEqual(["5", "5", "5", "5"]);
    expect(
      ratesByYear(
        "5",
        [
          { fromFiscalYear: 2026, rate: "12" },
          { fromFiscalYear: 2024, rate: "10" },
        ],
        years,
      ),
    ).toEqual(["5", "10", "10", "12"]);
  });

  it("turns a year table back into the first rate and the years it changes", () => {
    expect(stepsFromRates(years, ["5", "10", "10", "12"])).toEqual({
      rate: "5",
      steps: [
        { fromFiscalYear: 2024, rate: "10" },
        { fromFiscalYear: 2026, rate: "12" },
      ],
    });
    expect(stepsFromRates(years, ["5", "5 ", " 5", "5"])).toEqual({ rate: "5", steps: [] });
  });

  it("round-trips, and knows when every year is the same", () => {
    const rates = ["14.975", "14.975", "9.975", "9.975"];
    const { rate, steps } = stepsFromRates(years, rates);
    expect(ratesByYear(rate, steps, years)).toEqual(rates);
    expect(sameEveryYear(rates)).toBe(false);
    expect(sameEveryYear(["5", "5", "5", "5"])).toBe(true);
  });
});
