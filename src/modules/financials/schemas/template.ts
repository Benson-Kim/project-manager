import { z } from "zod";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import {
  fractionText,
  horizonSchema,
  labelListSchema,
  optionalBudgetAmountText,
  optionalText,
  percentText,
  sectionSchema,
  startMonthSchema,
  storedAmountText,
} from "./fields";

/**
 * Master financial templates (ADR-0029). A template is one JSON document in
 * app.FinancialTemplate.Definition. Its stored form keeps rates as fractions and
 * amounts as plain decimals; the editor works in percentages and typed amounts
 * and templateInput converts them. dbo.usp_FinancialTemplate_AssertDefinition
 * checks the same rules in SQL.
 */

const M = messages.financials;

export const TEMPLATE_LIMITS = { taxProfiles: 20, lines: 300 } as const;

const profileKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,20}$/);

function uniqueProfiles<T extends { key: string; name: string }>(
  profiles: T[],
  ctx: z.RefinementCtx,
) {
  if (
    new Set(profiles.map((p) => p.key)).size !== profiles.length ||
    new Set(profiles.map((p) => p.name)).size !== profiles.length
  ) {
    ctx.addIssue({ code: "custom", message: M.profilesDuplicate, path: ["taxProfiles"] });
  }
}

function knownProfileKeys<
  T extends { taxProfiles: { key: string }[]; lines: { taxProfileKey: string | null }[] },
>(doc: T, ctx: z.RefinementCtx) {
  const keys = new Set(doc.taxProfiles.map((p) => p.key));
  doc.lines.forEach((line, i) => {
    if (line.taxProfileKey !== null && !keys.has(line.taxProfileKey)) {
      ctx.addIssue({ code: "custom", message: M.taxProfile, path: ["lines", i, "taxProfileKey"] });
    }
  });
}

/** The stored document, as read back from the database. */
export const templateDefinitionSchema = z
  .object({
    horizonYears: horizonSchema,
    fiscalYearStartMonth: startMonthSchema,
    escalationRate: fractionText,
    flagThresholdRate: fractionText,
    taxProfiles: z
      .array(
        z.object({
          key: profileKey,
          name: z.string().trim().min(1).max(100),
          rate: fractionText,
          isDefault: z.boolean().default(false),
        }),
      )
      .max(TEMPLATE_LIMITS.taxProfiles),
    costCategories: labelListSchema,
    fundingSources: labelListSchema,
    lines: z
      .array(
        z.object({
          section: sectionSchema,
          description: z.string().trim().min(1).max(255),
          costCategory: z.string().trim().max(150).nullable().default(null),
          fundingSource: z.string().trim().max(150).nullable().default(null),
          taxProfileKey: profileKey.nullable().default(null),
          isRecurrent: z.boolean().default(false),
          amount: storedAmountText.nullable().default(null),
        }),
      )
      .max(TEMPLATE_LIMITS.lines),
  })
  .superRefine((doc, ctx) => {
    uniqueProfiles(doc.taxProfiles, ctx);
    knownProfileKeys(doc, ctx);
  });

export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

/** The editor's document: percentages and typed amounts, converted to the stored form. */
export const templateDefinitionInput = z
  .object({
    horizonYears: horizonSchema,
    fiscalYearStartMonth: startMonthSchema,
    escalationRate: percentText,
    flagThresholdRate: percentText,
    taxProfiles: z
      .array(
        z.object({
          key: profileKey,
          name: z.string().trim().min(1, M.profileName).max(100),
          rate: percentText,
          isDefault: z.boolean().default(false),
        }),
      )
      .max(TEMPLATE_LIMITS.taxProfiles),
    costCategories: labelListSchema,
    fundingSources: labelListSchema,
    lines: z
      .array(
        z.object({
          section: sectionSchema,
          description: z.string().trim().min(1, M.descriptionRequired).max(255),
          costCategory: optionalText(150),
          fundingSource: optionalText(150),
          taxProfileKey: z
            .union([z.literal(""), z.null(), profileKey])
            .optional()
            .transform((v) => v || null),
          isRecurrent: z.boolean().default(false),
          amount: optionalBudgetAmountText,
        }),
      )
      .max(TEMPLATE_LIMITS.lines),
  })
  .superRefine((doc, ctx) => {
    uniqueProfiles(doc.taxProfiles, ctx);
    knownProfileKeys(doc, ctx);
  });

export type TemplateDefinitionInput = z.input<typeof templateDefinitionInput>;

export const templateRowSchema = z.object({
  FinancialTemplateId: z.number().int(),
  Name: z.string(),
  Definition: z.string(),
  IsDefault: z.boolean(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type TemplateRow = z.infer<typeof templateRowSchema>;

export interface Template {
  id: number;
  name: string;
  isDefault: boolean;
  definition: TemplateDefinition;
  rowVer: number;
}

export function toTemplate(row: TemplateRow): Template {
  return {
    id: row.FinancialTemplateId,
    name: row.Name,
    isDefault: row.IsDefault,
    definition: templateDefinitionSchema.parse(JSON.parse(row.Definition)),
    rowVer: row.RowVer,
  };
}

export const saveTemplateInput = z.object({
  templateId: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => v ?? null),
  name: z.string().trim().min(1, M.templates.nameRequired).max(100),
  isDefault: z.boolean().default(false),
  definition: templateDefinitionInput,
  rowVer: rowVerSchema.nullish().transform((v) => v ?? null),
});

export type SaveTemplateInput = z.input<typeof saveTemplateInput>;

export const deleteTemplateInput = z.object({
  templateId: z.number().int().positive(),
  rowVer: rowVerSchema,
});
