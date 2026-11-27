import { z } from "zod";
import { execProc } from "@/lib/db";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import {
  readProjectMathState,
  type ProjectMathState,
  type saveProjectMathStateInput,
} from "../schemas/project-math-state";

const savedRowSchema = z.object({ StateJson: z.string(), RowVer: rowVerSchema });
const writtenRowSchema = z.object({ RowVer: rowVerSchema });

export type SavedProjectMath = { state: ProjectMathState | null; rowVer: number | null };

export async function getProjectMathState(
  projectId: number,
  actorUserId: number,
): Promise<SavedProjectMath> {
  const rows = await execProc("usp_ProjectMathState_Get", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) return { state: null, rowVer: null };
  const row = savedRowSchema.parse(rows[0]);
  return { state: readProjectMathState(row.StateJson), rowVer: row.RowVer };
}

export async function saveProjectMathState(
  p: z.output<typeof saveProjectMathStateInput>,
  actorUserId: number,
): Promise<number> {
  const rows = await execProc("usp_ProjectMathState_Save", {
    ProjectId: p.projectId,
    StateJson: JSON.stringify(p.state),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return writtenRowSchema.parse(rows[0]).RowVer;
}
