import { z } from "zod";
import { messages } from "@/lib/messages";
import { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, HORIZON_MAX, HORIZON_MIN } from "../calc/fiscal";
import {
  centsToDecimal,
  microsToFraction,
  parseFraction,
  parseMoney,
  parsePercent,
} from "../calc/money";

/**
 * Field schemas shared by the financials forms and actions (ADR-0029). Inputs
 * are what people type ("1,250.5", "5.6879"); outputs are the canonical text
 * the procs take ("1250.50", "0.056879"), so no amount or rate ever passes
 * through a float on its way to SQL.
 */

const M = messages.financials;

type MoneyRule = "nonNegative" | "nonZero";

function toMoneyText(value: string | number, rule: MoneyRule, ctx: z.RefinementCtx): string {
  const cents = parseMoney(String(value));
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: M.amountInvalid });
    return z.NEVER;
  }
  if (rule === "nonNegative" && cents < 0n) {
    ctx.addIssue({ code: "custom", message: M.amountNegative });
    return z.NEVER;
  }
  if (rule === "nonZero" && cents === 0n) {
    ctx.addIssue({ code: "custom", message: M.amountZero });
    return z.NEVER;
  }
  return centsToDecimal(cents);
}

function moneyText(rule: MoneyRule) {
  return z.union([z.string(), z.number()]).transform((value, ctx) => toMoneyText(value, rule, ctx));
}

/** A budget amount: 0 or more, two decimals at most. */
export const budgetAmountText = moneyText("nonNegative");

/** An invoice amount: non-zero; negative for a credit note. */
export const transactionAmountText = moneyText("nonZero");

/** An optional budget amount: "" means none. */
export const optionalBudgetAmountText = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value, ctx) =>
    value === null || value === undefined || String(value).trim() === ""
      ? null
      : toMoneyText(value, "nonNegative", ctx),
  );

/** A typed percentage ("5.6879") as the stored fraction ("0.056879"). */
export const percentText = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const micros = parsePercent(String(value));
  if (micros === null) {
    ctx.addIssue({ code: "custom", message: M.percentInvalid });
    return z.NEVER;
  }
  return microsToFraction(micros);
});

/** A stored fraction ("0.056879"), as kept in a template document. */
export const fractionText = z.string().refine((value) => parseFraction(value) !== null, {
  message: M.percentInvalid,
});

/** A stored amount ("350.00"), as kept in a template document. */
export const storedAmountText = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, M.amountInvalid);

export const fiscalYearSchema = z.coerce.number().int().min(FISCAL_YEAR_MIN).max(FISCAL_YEAR_MAX);
export const horizonSchema = z.coerce.number().int().min(HORIZON_MIN).max(HORIZON_MAX);
export const startMonthSchema = z.coerce.number().int().min(1).max(12);

/** A list of labels (cost categories, funding sources): trimmed, no blanks, no repeats. */
export const labelListSchema = z
  .array(z.string().trim().min(1).max(150, M.listTooLong))
  .max(200, M.listTooLong)
  .refine((list) => new Set(list).size === list.length, M.listDuplicate);

/** One label per line, as typed in a textarea, to a list. */
export function labelsFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const SECTION_VALUES = ["operating", "capital", "other"] as const;
export const sectionSchema = z.enum(SECTION_VALUES);

/** Optional text: trimmed, "" becomes null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
}
