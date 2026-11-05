import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import {
  createDecisionInput,
  decisionListRowSchema,
  decisionRowSchema,
  updateDecisionInput,
  type CreateDecisionInput,
  type DecisionListRow,
  type DecisionRow,
  type UpdateDecisionInput,
} from "../schemas/decision";

/**
 * Decision repository (ADR-0055) — stored procedures only, every row zod-parsed
 * at the boundary. The procs resolve the actor's project access from
 * @ActorUserId (ADR-0021) and audit themselves.
 *
 * The impacted areas and the consulted people are sets held in link tables. A
 * create always states both, so NULL never reaches OPENJSON; an update states a
 * set only when the caller sent one, which is what the proc's Set flag reads.
 */

export interface DecisionListFilters {
  status?: string | null;
  impactedArea?: string | null;
}

/** One picked set as the procs take it: a JSON array, or NULL to leave it alone. */
const jsonSet = (values: readonly (string | number)[] | null | undefined) =>
  values == null ? null : JSON.stringify(values);

function toProcParams(input: {
  title: string;
  dateLogged?: Date | null;
  ownerStakeholderId?: number | null;
  status?: string | null;
  problemContext?: string | null;
  optionsConsidered?: string | null;
  rationale?: string | null;
  nextSteps?: string | null;
  supersededByDecisionId?: number | null;
}) {
  return {
    Title: input.title,
    DateLogged: input.dateLogged ?? null,
    OwnerStakeholderId: input.ownerStakeholderId ?? null,
    Status: input.status ?? null,
    ProblemContext: input.problemContext ?? null,
    OptionsConsidered: input.optionsConsidered ?? null,
    Rationale: input.rationale ?? null,
    NextSteps: input.nextSteps ?? null,
    SupersededByDecisionId: input.supersededByDecisionId ?? null,
  };
}

export async function createDecision(
  input: CreateDecisionInput,
  actorUserId: number,
): Promise<DecisionRow> {
  const parsed = createDecisionInput.parse(input);
  const rows = await execProc<DecisionRow>("usp_Decision_Create", {
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    ImpactedAreas: JSON.stringify(parsed.impactedAreas ?? []),
    StakeholderIds: JSON.stringify(parsed.consultedStakeholderIds ?? []),
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) throw new AppError("INTERNAL", "Create returned no rows");
  return decisionRowSchema.parse(rows[0]);
}

export async function getDecisionById(
  decisionId: number,
  actorUserId: number,
): Promise<DecisionRow> {
  const rows = await execProc<DecisionRow>("usp_Decision_GetById", {
    DecisionId: decisionId,
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) throw new AppError("NOT_FOUND", messages.errors.NOT_FOUND);
  return decisionRowSchema.parse(rows[0]);
}

export async function listDecisions(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  filters: DecisionListFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<DecisionListRow[]> {
  const rows = await execProc<DecisionListRow>("usp_Decision_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    Status: filters.status ?? null,
    ImpactedArea: filters.impactedArea ?? null,
  });
  return rows.map((r) => decisionListRowSchema.parse(r));
}

export async function updateDecision(
  input: UpdateDecisionInput,
  actorUserId: number,
): Promise<DecisionRow> {
  const parsed = updateDecisionInput.parse(input);
  const rows = await execProc<DecisionRow>("usp_Decision_Update", {
    DecisionId: parsed.decisionId,
    RowVer: parsed.rowVer,
    ...toProcParams(parsed),
    ImpactedAreasSet: parsed.impactedAreas == null ? 0 : 1,
    ImpactedAreas: jsonSet(parsed.impactedAreas),
    StakeholderIdsSet: parsed.consultedStakeholderIds == null ? 0 : 1,
    StakeholderIds: jsonSet(parsed.consultedStakeholderIds),
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) throw new AppError("INTERNAL", "Update returned no rows");
  return decisionRowSchema.parse(rows[0]);
}

export async function deleteDecision(
  decisionId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Decision_Delete", {
    DecisionId: decisionId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/** What a decision may be marked superseded by: the project's own log. */
export interface DecisionOption {
  id: number;
  label: string;
}

const OPTIONS_PAGE = 100;

/**
 * The supersession picker's source — the project's decisions by number, read
 * through the list proc so the actor's access is checked the same way. A
 * decision cannot supersede itself, so the row being edited is left out; the
 * proc refuses a cycle regardless (ADR-0055).
 */
export async function listDecisionOptions(
  projectId: number,
  actorUserId: number,
  exceptDecisionId: number | null = null,
): Promise<DecisionOption[]> {
  const rows = await listDecisions(
    { page: 1, dir: "asc", q: undefined },
    actorUserId,
    projectId,
    {},
    OPTIONS_PAGE,
  );
  return rows
    .filter((row) => row.DecisionId !== exceptDecisionId)
    .map((row) => ({
      id: row.DecisionId,
      label: messages.decisions.refWithTitle(row.DecisionNumber, row.Title),
    }));
}
