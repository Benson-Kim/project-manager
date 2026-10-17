import { describe, expect, it } from "vitest";
import {
  amountField,
  cellErrors,
  lineValues,
  newLineValues,
  withCell,
} from "../components/line-cells";
import type { LineDto } from "../schemas/financial";

const years = [2023, 2024, 2025];

const line: LineDto = {
  id: 7,
  section: "operating",
  description: "Project management",
  costCategory: "Services",
  fundingSource: null,
  supplier: "Acme",
  glAccount: null,
  taxProfileId: 3,
  isRecurrent: false,
  comments: null,
  amounts: { 2023: "350.00", 2025: "100.00" },
  rowVer: 12,
};

describe("budget datasheet cells (ADR-0029 amendment)", () => {
  it("sends a line as the line sheet does: text fields, the tax id, typed years only", () => {
    expect(lineValues(line, years)).toEqual({
      section: "operating",
      description: "Project management",
      costCategory: "Services",
      fundingSource: "",
      supplier: "Acme",
      glAccount: "",
      taxProfileId: "3",
      isRecurrent: false,
      comments: "",
      amounts: [
        { fiscalYear: 2023, amount: "350.00" },
        { fiscalYear: 2025, amount: "100.00" },
      ],
    });
  });

  it("puts one cell's text in place and keeps the rest of the line", () => {
    expect(withCell(line, amountField(2024), "1,200").amounts).toEqual({
      2023: "350.00",
      2024: "1,200",
      2025: "100.00",
    });
    expect(lineValues(withCell(line, amountField(2023), " "), years).amounts).toEqual([
      { fiscalYear: 2025, amount: "100.00" },
    ]);
    expect(withCell(line, "taxProfileId", "")).toMatchObject({ taxProfileId: null });
    expect(withCell(line, "isRecurrent", "on")).toMatchObject({ isRecurrent: true });
    expect(withCell(line, "costCategory", "")).toMatchObject({ costCategory: null });
    expect(withCell(line, "description", "PM")).toMatchObject({
      description: "PM",
      supplier: "Acme",
    });
  });

  it("builds a new line in its section from the new-entry row", () => {
    const draft = {
      description: "Licences",
      costCategory: "Software",
      fundingSource: "",
      taxProfileId: "3",
      isRecurrent: "on",
      [amountField(2024)]: "500",
      [amountField(2025)]: "",
    };
    expect(newLineValues("capital", draft, years)).toEqual({
      section: "capital",
      description: "Licences",
      costCategory: "Software",
      fundingSource: "",
      supplier: "",
      glAccount: "",
      taxProfileId: "3",
      isRecurrent: true,
      comments: "",
      amounts: [{ fiscalYear: 2024, amount: "500" }],
    });
  });

  it("names the year's cell for an amount the action refused", () => {
    const sent = newLineValues(
      "operating",
      { description: "", [amountField(2023)]: "1", [amountField(2025)]: "x" },
      years,
    );
    expect(
      cellErrors({ description: ["Enter a description"], "amounts.1.amount": ["Bad"] }, sent),
    ).toEqual({ description: ["Enter a description"], [amountField(2025)]: ["Bad"] });
  });
});
