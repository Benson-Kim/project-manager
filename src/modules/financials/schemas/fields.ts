import { z } from "zod";
import { NO_CURRENCY, currencyOrNone, isCurrencyCode } from "@/lib/currency/currencies";
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

/**
 * The currency figures are shown in, or "" for no symbol (ADR-0051). Trimmed
 * and upper-cased first and then checked by shape, in that order and with that
 * one rule, exactly as usp_Financial_Update does it — were the two to disagree,
 * a value this layer discarded would be one the proc would have accepted.
 */
const normaliseCurrency = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

/**
 * A currency someone is choosing. A misshapen code is refused rather than read
 * as no symbol: blanking it would reset a configured currency exactly as an
 * omitted field would, and both procs throw on one rather than blank it.
 */
function toChosenCurrency(value: string | undefined, ctx: z.RefinementCtx): string {
  const code = normaliseCurrency(value);
  if (code !== NO_CURRENCY && !isCurrencyCode(code)) {
    ctx.addIssue({ code: "custom", message: M.currencyInvalid });
    return z.NEVER;
  }
  return code;
}

/**
 * Required, because the sheet's update is a full replacement: were it optional,
 * a payload that left it out would parse clean and silently reset a configured
 * currency to no symbol.
 */
export const currencySchema = z.string().transform(toChosenCurrency);

/**
 * A stored template document, which may predate the field and is nobody's
 * choice at this point: anything misshapen reads as no symbol, and
 * usp_FinancialTemplate_AssertDefinition is the gate on what may be written.
 */
export const storedCurrencySchema = z
  .string()
  .optional()
  .transform((value) => currencyOrNone(normaliseCurrency(value)));

/** A list of labels (cost categories, funding sources): trimmed, no blanks, no repeats. */
export const labelListSchema = z
  .array(z.string().trim().min(1).max(150, M.listTooLong))
  .max(200, M.listTooLong)
  .refine((list) => new Set(list).size === list.length, M.listDuplicate);

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
