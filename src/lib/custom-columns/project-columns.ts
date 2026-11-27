import type { Permission } from "@/lib/auth/types";
import type { ColumnLabel, RegisterColumn } from "./register";

type ColumnSource = {
  listLabels(projectId: number, actorUserId: number): Promise<ColumnLabel[]>;
  listColumns(projectId: number, actorUserId: number): Promise<RegisterColumn[]>;
};

type ProjectPermissions = (
  projectId: number,
  actorUserId: number,
) => Promise<(permission: Permission) => boolean>;

export type ColumnRights = { create: Permission; update: Permission; delete: Permission };

export type ProjectColumns = {
  projectId: number;
  labels: ColumnLabel[];
  addedColumns: RegisterColumn[];
  canManageColumns: { create: boolean; update: boolean; delete: boolean };
};

export async function loadProjectColumns(
  projectId: number | null,
  deps: { columns: ColumnSource; permissions: ProjectPermissions; rights: ColumnRights },
  actorUserId: number,
): Promise<ProjectColumns | null> {
  if (projectId === null) return null;
  const [allows, labels, addedColumns] = await Promise.all([
    deps.permissions(projectId, actorUserId),
    deps.columns.listLabels(projectId, actorUserId),
    deps.columns.listColumns(projectId, actorUserId),
  ]);
  return {
    projectId,
    labels,
    addedColumns,
    canManageColumns: {
      create: allows(deps.rights.create),
      update: allows(deps.rights.update),
      delete: allows(deps.rights.delete),
    },
  };
}
