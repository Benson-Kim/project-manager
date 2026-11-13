import { execProc, execProcSets, execProcTx, withTransaction } from "@/lib/db";
import {
  cellRowSchema,
  createdMatrixRowSchema,
  createMatrixInput,
  deleteMatrixInput,
  matrixInput,
  matrixRowSchema,
  memberInput,
  memberRowSchema,
  moveMemberInput,
  renameMatrixInput,
  rowVerRowSchema,
  setCellInput,
  setCellRowSchema,
  setCellsInput,
  type CreateMatrixInput,
  type DeleteMatrixInput,
  type MatrixInput,
  type MemberInput,
  type MoveMemberInput,
  type RenameMatrixInput,
  type ResponsibilityCell,
  type ResponsibilityMatrixSummary,
  type ResponsibilityMember,
  type RowVer,
  type SetCellInput,
  type SetCellResult,
  type SetCellsInput,
} from "../schemas/responsibility-matrix";

export async function listResponsibilityMatrices(
  projectId: number,
  actorUserId: number,
): Promise<ResponsibilityMatrixSummary[]> {
  const rows = await execProc("usp_ResponsibilityMatrix_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => matrixRowSchema.parse(r));
}

export async function createResponsibilityMatrix(input: CreateMatrixInput, actorUserId: number) {
  const p = createMatrixInput.parse(input);
  const rows = await execProc("usp_ResponsibilityMatrix_Create", {
    ProjectId: p.projectId,
    Name: p.name,
    FrameworkCode: p.frameworkCode,
    RowKind: p.rowKind ?? null,
    ActorUserId: actorUserId,
  });
  return createdMatrixRowSchema.parse(rows[0]);
}

export async function renameResponsibilityMatrix(
  input: RenameMatrixInput,
  actorUserId: number,
): Promise<RowVer> {
  const p = renameMatrixInput.parse(input);
  const rows = await execProc("usp_ResponsibilityMatrix_Rename", {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    Name: p.name,
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return rowVerRowSchema.parse(rows[0]);
}

export async function deleteResponsibilityMatrix(
  input: DeleteMatrixInput,
  actorUserId: number,
): Promise<void> {
  const p = deleteMatrixInput.parse(input);
  await execProc("usp_ResponsibilityMatrix_Delete", {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
}

async function changeMember(
  proc: "usp_ResponsibilityMember_Add" | "usp_ResponsibilityMember_Remove",
  input: MemberInput,
  actorUserId: number,
): Promise<RowVer> {
  const p = memberInput.parse(input);
  const rows = await execProc(proc, {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    StakeholderId: p.stakeholderId,
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return rowVerRowSchema.parse(rows[0]);
}

export const addResponsibilityMember = (input: MemberInput, actorUserId: number) =>
  changeMember("usp_ResponsibilityMember_Add", input, actorUserId);

export const removeResponsibilityMember = (input: MemberInput, actorUserId: number) =>
  changeMember("usp_ResponsibilityMember_Remove", input, actorUserId);

export async function moveResponsibilityMember(
  input: MoveMemberInput,
  actorUserId: number,
): Promise<RowVer> {
  const p = moveMemberInput.parse(input);
  const rows = await execProc("usp_ResponsibilityMember_Move", {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    StakeholderId: p.stakeholderId,
    Position: p.position,
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return rowVerRowSchema.parse(rows[0]);
}

export async function listResponsibilityCells(
  input: MatrixInput,
  actorUserId: number,
): Promise<{ members: ResponsibilityMember[]; cells: ResponsibilityCell[] }> {
  const p = matrixInput.parse(input);
  const [members = [], cells = []] = await execProcSets("usp_ResponsibilityAssignment_List", {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    ActorUserId: actorUserId,
  });
  return {
    members: members.map((r) => memberRowSchema.parse(r)),
    cells: cells.map((r) => cellRowSchema.parse(r)),
  };
}

export async function setResponsibilityCell(
  input: SetCellInput,
  actorUserId: number,
): Promise<SetCellResult> {
  const p = setCellInput.parse(input);
  const rows = await execProc("usp_ResponsibilityAssignment_Set", cellParams(p, actorUserId));
  return setCellRowSchema.parse(rows[0]);
}

export async function setResponsibilityCells(
  input: SetCellsInput,
  actorUserId: number,
): Promise<SetCellResult[]> {
  const { writes, ...matrix } = setCellsInput.parse(input);
  return withTransaction(async (tx) => {
    const results: SetCellResult[] = [];
    for (const write of writes) {
      const rows = await execProcTx(
        tx,
        "usp_ResponsibilityAssignment_Set",
        cellParams({ ...matrix, ...write, moveSingle: false }, actorUserId),
      );
      results.push(setCellRowSchema.parse(rows[0]));
    }
    return results;
  });
}

function cellParams(p: ReturnType<typeof setCellInput.parse>, actorUserId: number) {
  return {
    ProjectId: p.projectId,
    ResponsibilityMatrixId: p.matrixId,
    KeyDeliverableId: p.row.kind === "WbsItem" ? p.row.keyDeliverableId : null,
    DecisionId: p.row.kind === "Decision" ? p.row.decisionId : null,
    StakeholderId: p.stakeholderId,
    RoleCode: p.roleCode,
    ExpectedRoleCode: p.expectedRoleCode,
    MoveSingle: p.moveSingle ?? false,
    ActorUserId: actorUserId,
  };
}
