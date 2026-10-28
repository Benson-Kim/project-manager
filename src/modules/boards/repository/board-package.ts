import { z } from "zod";
import { requirementOptionSchema } from "@/modules/requirements/schemas/requirement";
import { execProc } from "@/lib/db";
import { packageRequirementsInput, type PackageRequirementsInput } from "../schemas/board-package";
export async function packageRequirements(input: PackageRequirementsInput, actorUserId: number) {
  const parsed = packageRequirementsInput.parse(input);
  const rows = await execProc("usp_BoardCard_Package", {
    BoardId: parsed.boardId,
    BoardColumnId: parsed.boardColumnId,
    BoardSprintId: parsed.boardSprintId ?? null,
    RequirementIds: JSON.stringify(parsed.requirementIds),
    ActorUserId: actorUserId,
  });
  return z.object({ AddedCards: z.number().int(), SkippedCards: z.number().int() }).parse(rows[0]);
}

/** Board imports include solutions as well as needs; trace-link options deliberately do not. */
export async function listPackagingRequirementOptions(projectId: number, actorUserId: number) {
  const rows = await execProc("usp_Requirement_ListPackagingOptions", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => requirementOptionSchema.parse(row));
}
