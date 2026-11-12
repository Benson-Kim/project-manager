import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import {
  RESPONSIBILITY_FRAMEWORK_CODES,
  type ResponsibilityFramework,
  type ResponsibilityFrameworkCode,
  type ResponsibilityRowKind,
} from "./responsibility-frameworks";

export type RowVer = z.infer<typeof rowVerSchema>;

export type ResponsibilityRowRef =
  { kind: "WbsItem"; keyDeliverableId: number } | { kind: "Decision"; decisionId: number };

export interface ResponsibilityMatrixSummary {
  id: number;
  projectId: number;
  name: string;
  frameworkCode: ResponsibilityFrameworkCode;
  rowKind: ResponsibilityRowKind;
  memberCount: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  rowVer: RowVer;
}

export interface ResponsibilityMember {
  stakeholderId: number;
  name: string;
  sortOrder: number;
}

export interface ResponsibilityCell {
  row: ResponsibilityRowRef;
  stakeholderId: number;
  roleCode: string;
  isMember: boolean;
}

export interface ResponsibilityRowFlags {
  missing: string[];
  duplicated: string[];
}

export function cellKey(row: ResponsibilityRowRef, stakeholderId: number): string {
  return row.kind === "WbsItem"
    ? `W:${row.keyDeliverableId}:${stakeholderId}`
    : `D:${row.decisionId}:${stakeholderId}`;
}

export function rowFlags(
  framework: ResponsibilityFramework,
  roleCodes: readonly string[],
): ResponsibilityRowFlags {
  const counts = new Map<string, number>();
  for (const code of roleCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
  const missing: string[] = [];
  const duplicated: string[] = [];
  for (const role of framework.roles) {
    const n = counts.get(role.code) ?? 0;
    if (role.requiredPerRow && n === 0) missing.push(role.code);
    if (role.onePerRow && n > 1) duplicated.push(role.code);
  }
  return { missing, duplicated };
}

const id = z.coerce.number().int().positive();
const roleCode = z.string().trim().min(1).max(40);
const frameworkCode = z.enum(RESPONSIBILITY_FRAMEWORK_CODES);
const rowKind = z.enum(["WbsItem", "Decision"]);
const matrixName = z.string().trim().min(1).max(100);

export const rowRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("WbsItem"), keyDeliverableId: id }),
  z.object({ kind: z.literal("Decision"), decisionId: id }),
]);

export const projectInput = z.object({ projectId: id });
export const matrixInput = z.object({ projectId: id, matrixId: id });
export const createMatrixInput = z.object({
  projectId: id,
  name: matrixName,
  frameworkCode,
  rowKind: rowKind.optional(),
});
export const renameMatrixInput = matrixInput.extend({ name: matrixName, rowVer: rowVerSchema });
export const deleteMatrixInput = matrixInput.extend({ rowVer: rowVerSchema });
export const memberInput = matrixInput.extend({ stakeholderId: id, rowVer: rowVerSchema });
export const moveMemberInput = memberInput.extend({
  position: z.coerce.number().int().nonnegative(),
});
export const setCellInput = matrixInput.extend({
  row: rowRefSchema,
  stakeholderId: id,
  roleCode: roleCode.nullable(),
  expectedRoleCode: roleCode.nullable(),
  moveSingle: z.boolean().optional(),
});

export type SetCellInput = z.input<typeof setCellInput>;
export type MatrixInput = z.input<typeof matrixInput>;
export type CreateMatrixInput = z.input<typeof createMatrixInput>;
export type RenameMatrixInput = z.input<typeof renameMatrixInput>;
export type DeleteMatrixInput = z.input<typeof deleteMatrixInput>;
export type MemberInput = z.input<typeof memberInput>;
export type MoveMemberInput = z.input<typeof moveMemberInput>;

export interface SetCellResult {
  roleCode: string | null;
  keyDeliverableRowVer: RowVer | null;
}

export const matrixRowSchema = z
  .object({
    ResponsibilityMatrixId: id,
    ProjectId: id,
    Name: z.string(),
    FrameworkCode: frameworkCode,
    RowKind: rowKind,
    MemberCount: z.coerce.number().int().nonnegative(),
    CreatedAtUtc: z.coerce.date(),
    UpdatedAtUtc: z.coerce.date().nullable(),
    RowVer: rowVerSchema,
  })
  .transform((r): ResponsibilityMatrixSummary => ({
    id: r.ResponsibilityMatrixId,
    projectId: r.ProjectId,
    name: r.Name,
    frameworkCode: r.FrameworkCode,
    rowKind: r.RowKind,
    memberCount: r.MemberCount,
    createdAtUtc: r.CreatedAtUtc.toISOString(),
    updatedAtUtc: r.UpdatedAtUtc?.toISOString() ?? null,
    rowVer: r.RowVer,
  }));

export const memberRowSchema = z
  .object({ StakeholderId: id, Name: z.string(), SortOrder: z.coerce.number().int() })
  .transform((r): ResponsibilityMember => ({
    stakeholderId: r.StakeholderId,
    name: r.Name,
    sortOrder: r.SortOrder,
  }));

export const cellRowSchema = z
  .object({
    KeyDeliverableId: id.nullable(),
    DecisionId: id.nullable(),
    StakeholderId: id,
    RoleCode: roleCode,
    IsMember: z.coerce.boolean(),
  })
  .refine((r) => (r.KeyDeliverableId === null) !== (r.DecisionId === null), {
    message: "A cell belongs to exactly one row",
  })
  .transform((r): ResponsibilityCell => ({
    row:
      r.KeyDeliverableId !== null
        ? { kind: "WbsItem", keyDeliverableId: r.KeyDeliverableId }
        : { kind: "Decision", decisionId: r.DecisionId as number },
    stakeholderId: r.StakeholderId,
    roleCode: r.RoleCode,
    isMember: r.IsMember,
  }));

export const setCellRowSchema = z
  .object({ RoleCode: roleCode.nullable(), KeyDeliverableRowVer: rowVerSchema.nullable() })
  .transform((r): SetCellResult => ({
    roleCode: r.RoleCode,
    keyDeliverableRowVer: r.KeyDeliverableRowVer,
  }));

export const rowVerRowSchema = z.object({ RowVer: rowVerSchema }).transform((r) => r.RowVer);
export const createdMatrixRowSchema = z
  .object({ ResponsibilityMatrixId: id, RowVer: rowVerSchema })
  .transform((r) => ({ id: r.ResponsibilityMatrixId, rowVer: r.RowVer }));
