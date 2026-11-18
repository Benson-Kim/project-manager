import { z } from "zod";

export const GOVERNANCE_LOG_KINDS = [
  "Decision",
  "AssumptionConstraint",
  "RiskIssue",
  "QuestionAnswer",
  "ParkingLotItem",
] as const;

export const governanceLogKindSchema = z.enum(GOVERNANCE_LOG_KINDS);
export type GovernanceLogKind = z.infer<typeof governanceLogKindSchema>;

export interface GovernanceLog {
  kind: GovernanceLogKind;
  label: string;
  segment: string;
}

export const GOVERNANCE_LOGS: readonly GovernanceLog[] = [
  { kind: "Decision", label: "Decision log", segment: "decisions" },
  {
    kind: "AssumptionConstraint",
    label: "Assumptions & constraints",
    segment: "assumptions-constraints",
  },
  { kind: "RiskIssue", label: "Risks & issues", segment: "risks-issues" },
  { kind: "QuestionAnswer", label: "Questions & answers", segment: "questions-answers" },
  { kind: "ParkingLotItem", label: "Parking lot", segment: "parking-lot" },
];

export const governanceLogOf = (kind: GovernanceLogKind): GovernanceLog =>
  GOVERNANCE_LOGS.find((log) => log.kind === kind) as GovernanceLog;

export const governanceLogPermission = (
  kind: GovernanceLogKind,
  verb: "create" | "update",
): `${string}:${string}` => `${governanceLogOf(kind).segment}:${verb}`;

export const governanceLogHref = (projectId: number, kind: GovernanceLogKind): string =>
  `/projects/${projectId}/${governanceLogOf(kind).segment}`;

export const governanceLogRecordHref = (
  projectId: number,
  kind: GovernanceLogKind,
  recordId: number,
): string => `${governanceLogHref(projectId, kind)}?id=${recordId}`;

export const actionLogLinkSchema = z.object({
  LogKind: governanceLogKindSchema,
  RecordId: z.number().int(),
});
export type ActionLogLink = z.infer<typeof actionLogLinkSchema>;

export const actionLogLinksSchema = z
  .array(actionLogLinkSchema)
  .nullish()
  .transform((links) => links ?? []);
