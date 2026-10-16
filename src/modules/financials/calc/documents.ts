import { messages } from "@/lib/messages";
import type { DocumentDto, Suggestion } from "../schemas/documents";
import type { SheetDto } from "../schemas/financial";
import type { Plan } from "./engine";
import { formatMoney, parseMoney } from "./money";

/**
 * Advisory reasons for not creating a document (ADR-0030). The thresholds in
 * the MSSS rules are "captured as reason fields, not hard rules"
 * (requirements.md section 6): a matching rule only offers its reason, and the
 * person decides. Rules are measured on the whole budget: the authorised budget
 * when one is entered, else the planned total on the same basis (tax included
 * or before tax).
 */

const M = messages.financials.documents;

export interface BudgetBasis {
  cents: bigint;
  source: "authorised" | "planned";
}

export interface SuggestionContext {
  /** Null when neither an authorised budget nor any planned amount exists yet. */
  budget: BudgetBasis | null;
  plannedBeforeTax: bigint;
  capitalBeforeTax: bigint;
}

export interface SuggestionMatch {
  kind: Suggestion["kind"];
  reason: string;
  /** Why it matched, e.g. "The budget 150,000.00 is under 200,000.00." */
  detail: string;
}

export function suggestionContext(sheet: SheetDto, plan: Plan): SuggestionContext {
  const f = sheet.financial;
  const authorised = f.budget === null ? null : parseMoney(f.budget);
  const planned = f.budgetIncludesTax ? plan.total.withTax : plan.total.beforeTax;
  const budget: BudgetBasis | null =
    authorised !== null
      ? { cents: authorised, source: "authorised" }
      : planned > 0n
        ? { cents: planned, source: "planned" }
        : null;
  return {
    budget,
    plannedBeforeTax: plan.total.beforeTax,
    capitalBeforeTax: plan.sections.capital.beforeTax,
  };
}

export function matchSuggestion(rule: Suggestion, ctx: SuggestionContext): SuggestionMatch | null {
  if (rule.kind === "budgetBelow") {
    const limit = parseMoney(rule.amount);
    if (ctx.budget === null || limit === null || ctx.budget.cents >= limit) return null;
    return {
      kind: rule.kind,
      reason: rule.reason,
      detail: M.matchBudgetBelow(formatMoney(ctx.budget.cents), formatMoney(limit)),
    };
  }
  if (ctx.plannedBeforeTax <= 0n || ctx.capitalBeforeTax !== 0n) return null;
  return { kind: rule.kind, reason: rule.reason, detail: M.matchNoCapital };
}

/** The first rule of the document that matches, in the order it lists them. */
export function documentSuggestion(
  doc: Pick<DocumentDto, "suggestions">,
  ctx: SuggestionContext,
): SuggestionMatch | null {
  for (const rule of doc.suggestions) {
    const match = matchSuggestion(rule, ctx);
    if (match) return match;
  }
  return null;
}

export interface DocumentSummary {
  total: number;
  required: number;
  notRequired: number;
  undecided: number;
  requiredWithFile: number;
}

export function documentSummary(documents: readonly DocumentDto[]): DocumentSummary {
  return {
    total: documents.length,
    required: documents.filter((d) => d.required === true).length,
    notRequired: documents.filter((d) => d.required === false).length,
    undecided: documents.filter((d) => d.required === null).length,
    requiredWithFile: documents.filter((d) => d.required === true && d.fileCount > 0).length,
  };
}

/** "Required" / "Not required" / "Not decided". */
export function requiredLabel(required: boolean | null): string {
  return required === null ? M.undecided : required ? M.requiredYes : M.requiredNo;
}
