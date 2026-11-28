import { z } from "zod";
import {
  CROSS_LINK_ANCHOR_KINDS,
  CROSS_LINK_MODULES,
  MAX_ENDPOINT_LABEL_LEN,
  MAX_LINK_NOTE_LEN,
  MAX_LINK_TITLE_LEN,
  STICKY_COLORS,
  isSameEndpoint,
  locationAnchorSchema,
  type CrossLinkAnchorKind,
  type CrossLinkModuleKey,
  type LocationAnchor,
  type StickyColor,
} from "./location";

const CONTROL_CHARS_SINGLE = /[\u0000-\u001F\u007F]/g;
const CONTROL_CHARS_MULTI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG_REGEX = /<[a-z!/]/i;

export function normalizePlainText(raw: string, multiline = false): string {
  const cleaned = multiline
    ? raw.replace(CONTROL_CHARS_MULTI, "")
    : raw.replace(CONTROL_CHARS_SINGLE, " ");
  return cleaned.trim();
}

export function plainTextRequired(maxLen: number, multiline = false) {
  return z
    .string()
    .transform((s) => normalizePlainText(s, multiline))
    .refine((s) => s.length >= 1, { message: "Required" })
    .refine((s) => s.length <= maxLen, { message: `Use ${maxLen} characters or fewer` })
    .refine((s) => !HTML_TAG_REGEX.test(s), { message: "HTML is not allowed" });
}

export function plainTextOptional(maxLen: number, multiline = false) {
  return z
    .string()
    .nullable()
    .optional()
    .transform((s) => {
      if (s === null || s === undefined) return null;
      const clean = normalizePlainText(s, multiline);
      return clean.length > 0 ? clean : null;
    })
    .refine((s) => s === null || s.length <= maxLen, {
      message: `Use ${maxLen} characters or fewer`,
    })
    .refine((s) => s === null || !HTML_TAG_REGEX.test(s), { message: "HTML is not allowed" });
}

export const endpointWithLabelSchema = locationAnchorSchema.extend({
  label: plainTextRequired(MAX_ENDPOINT_LABEL_LEN, false),
});

export type EndpointWithLabel = z.infer<typeof endpointWithLabelSchema>;

export const createCrossLinkInput = z
  .object({
    endA: endpointWithLabelSchema,
    endB: endpointWithLabelSchema,
    linkTitle: plainTextRequired(MAX_LINK_TITLE_LEN, false),
    noteText: plainTextOptional(MAX_LINK_NOTE_LEN, true),
    color: z.enum(STICKY_COLORS).default("yellow"),
  })
  .superRefine((val, ctx) => {
    if (isSameEndpoint(val.endA, val.endB)) {
      ctx.addIssue({
        code: "custom",
        path: ["endB"],
        message: "Choose two different places to link",
      });
    }
  });

export type CreateCrossLinkInput = z.input<typeof createCrossLinkInput>;

export const updateCrossLinkInput = z.object({
  crossLinkId: z.number().int().positive(),
  linkTitle: plainTextRequired(MAX_LINK_TITLE_LEN, false),
  noteText: plainTextOptional(MAX_LINK_NOTE_LEN, true),
  color: z.enum(STICKY_COLORS).default("yellow"),
  rowVer: z.coerce.number().int().positive(),
});

export type UpdateCrossLinkInput = z.input<typeof updateCrossLinkInput>;

export const deleteCrossLinkInput = z.object({
  crossLinkId: z.number().int().positive(),
  rowVer: z.coerce.number().int().positive(),
});

export type DeleteCrossLinkInput = z.input<typeof deleteCrossLinkInput>;

export const getCrossLinkInput = z.object({
  crossLinkId: z.number().int().positive(),
});

export const listCrossLinksInput = z.object({
  moduleKey: locationAnchorSchema.shape.moduleKey,
  projectId: z.number().int().positive().nullable(),
  entityId: z.number().int().positive().nullable(),
});

export const isoDateTimeParser = z
  .union([z.date(), z.string()])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));

export const positiveRowVerParser = z.coerce.number().int().positive();

export const crossLinkDbRowSchema = z.object({
  CrossLinkId: z.number().int().positive(),
  Side: z.enum(["A", "B"]).optional(),
  EndAModule: z.enum(CROSS_LINK_MODULES),
  EndAProjectId: z.number().int().positive().nullable(),
  EndAEntityId: z.number().int().positive().nullable(),
  EndASubEntityId: z.number().int().positive().nullable(),
  EndAAnchorKind: z.enum(CROSS_LINK_ANCHOR_KINDS),
  EndAAnchorKey: z.string().nullable(),
  EndALabel: z.string(),
  EndBModule: z.enum(CROSS_LINK_MODULES),
  EndBProjectId: z.number().int().positive().nullable(),
  EndBEntityId: z.number().int().positive().nullable(),
  EndBSubEntityId: z.number().int().positive().nullable(),
  EndBAnchorKind: z.enum(CROSS_LINK_ANCHOR_KINDS),
  EndBAnchorKey: z.string().nullable(),
  EndBLabel: z.string(),
  LinkTitle: z.string(),
  NoteText: z.string().nullable(),
  Color: z.enum(STICKY_COLORS),
  CreatedBy: z.number().int().positive(),
  CreatedAtUtc: isoDateTimeParser,
  UpdatedAtUtc: isoDateTimeParser.nullable(),
  RowVer: positiveRowVerParser,
});

export interface CrossLinkEndpointDto extends LocationAnchor {
  label: string;
  href: string;
}

export interface CrossLinkItem {
  crossLinkId: number;
  side: "A" | "B";
  here: CrossLinkEndpointDto;
  there: CrossLinkEndpointDto;
  endA: CrossLinkEndpointDto;
  endB: CrossLinkEndpointDto;
  linkTitle: string;
  noteText: string | null;
  color: StickyColor;
  createdBy: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  rowVer: number;
}

export type CrossLinkDbRow = {
  CrossLinkId: number;
  Side?: "A" | "B";
  EndAModule: CrossLinkModuleKey;
  EndAProjectId: number | null;
  EndAEntityId: number | null;
  EndASubEntityId: number | null;
  EndAAnchorKind: CrossLinkAnchorKind;
  EndAAnchorKey: string | null;
  EndALabel: string;
  EndBModule: CrossLinkModuleKey;
  EndBProjectId: number | null;
  EndBEntityId: number | null;
  EndBSubEntityId: number | null;
  EndBAnchorKind: CrossLinkAnchorKind;
  EndBAnchorKey: string | null;
  EndBLabel: string;
  LinkTitle: string;
  NoteText: string | null;
  Color: StickyColor;
  CreatedBy: number;
  CreatedAtUtc: Date | string;
  UpdatedAtUtc: Date | string | null;
  RowVer: number | string;
};
