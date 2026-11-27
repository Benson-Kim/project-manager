import { z } from "zod";
import {
  isoDateTimeParser,
  plainTextOptional,
  plainTextRequired,
  positiveRowVerParser,
} from "./cross-link";
import {
  CROSS_LINK_ANCHOR_KINDS,
  CROSS_LINK_MODULES,
  MAX_ENDPOINT_LABEL_LEN,
  MAX_PAGE_NOTE_LEN,
  STICKY_COLORS,
  locationAnchorSchema,
  type CrossLinkAnchorKind,
  type CrossLinkModuleKey,
  type LocationAnchor,
  type StickyColor,
} from "./location";

export const createPageNoteInput = locationAnchorSchema.extend({
  anchorLabel: plainTextOptional(MAX_ENDPOINT_LABEL_LEN, false),
  body: plainTextRequired(MAX_PAGE_NOTE_LEN, true),
  color: z.enum(STICKY_COLORS).default("yellow"),
});

export type CreatePageNoteInput = z.input<typeof createPageNoteInput>;

export const updatePageNoteInput = z.object({
  pageNoteId: z.number().int().positive(),
  body: plainTextRequired(MAX_PAGE_NOTE_LEN, true),
  color: z.enum(STICKY_COLORS).default("yellow"),
  rowVer: z.coerce.number().int().positive(),
});

export type UpdatePageNoteInput = z.input<typeof updatePageNoteInput>;

export const deletePageNoteInput = z.object({
  pageNoteId: z.number().int().positive(),
  rowVer: z.coerce.number().int().positive(),
});

export type DeletePageNoteInput = z.input<typeof deletePageNoteInput>;

export const getPageNoteInput = z.object({
  pageNoteId: z.number().int().positive(),
});

export const listPageNotesInput = z.object({
  moduleKey: locationAnchorSchema.shape.moduleKey,
  projectId: z.number().int().positive().nullable(),
  entityId: z.number().int().positive().nullable(),
});

export const pageNoteDbRowSchema = z.object({
  PageNoteId: z.number().int().positive(),
  ModuleKey: z.enum(CROSS_LINK_MODULES),
  ProjectId: z.number().int().positive().nullable(),
  EntityId: z.number().int().positive().nullable(),
  SubEntityId: z.number().int().positive().nullable(),
  AnchorKind: z.enum(CROSS_LINK_ANCHOR_KINDS),
  AnchorKey: z.string().nullable(),
  AnchorLabel: z.string().nullable(),
  Body: z.string(),
  Color: z.enum(STICKY_COLORS),
  CreatedBy: z.number().int().positive(),
  CreatedAtUtc: isoDateTimeParser,
  UpdatedAtUtc: isoDateTimeParser.nullable(),
  RowVer: positiveRowVerParser,
});

export interface PageNoteItem extends LocationAnchor {
  pageNoteId: number;
  anchorLabel: string | null;
  body: string;
  color: StickyColor;
  href: string;
  createdBy: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  rowVer: number;
}

export type PageNoteDbRow = {
  PageNoteId: number;
  ModuleKey: CrossLinkModuleKey;
  ProjectId: number | null;
  EntityId: number | null;
  SubEntityId: number | null;
  AnchorKind: CrossLinkAnchorKind;
  AnchorKey: string | null;
  AnchorLabel: string | null;
  Body: string;
  Color: StickyColor;
  CreatedBy: number;
  CreatedAtUtc: Date | string;
  UpdatedAtUtc: Date | string | null;
  RowVer: number | string;
};
