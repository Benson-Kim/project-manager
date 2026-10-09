import {
  canInProject,
  OVERRIDABLE_MODULES,
  OVERRIDE_VERBS,
  type OverridableModule,
  type OverrideVerb,
  type PermissionOverride,
} from "@/lib/auth/rbac";
import type { AccessLevel } from "@/lib/auth/types";
import { messages } from "@/lib/messages";

/**
 * Pure state of the team's permission dialog (ADR-0024): a grid of sections ×
 * add / edit / delete where each cell is the level's default, Allow or Deny.
 * DOM-free so Vitest covers it (ADR-0013); the dialog only renders it.
 */

const P = messages.projects;

/** Section names as the project's section nav shows them. */
export const SECTION_LABELS: Record<OverridableModule, string> = {
  "assumptions-constraints": P.assumptionsConstraintsSection,
  "daily-activities": P.dailyActivitiesSection,
  "key-deliverables": P.deliverablesSection,
  keywords: P.keywordsSection,
  objectives: P.objectivesSection,
  "parking-lot": P.parkingLotSection,
  "questions-answers": P.questionsAnswersSection,
  stakeholders: P.stakeholdersSection,
  suppliers: P.suppliersSection,
  "todo-alerts": P.permissions.todoAlertsSection,
  "todo-items": P.todosSection,
};

export const VERB_LABELS: Record<OverrideVerb, string> = {
  create: P.permissions.create,
  update: P.permissions.update,
  delete: P.permissions.delete,
};

/** A cell's choice: the level's default, or an override. */
export type Choice = "" | "allow" | "deny";
export type Choices = Partial<Record<`${OverridableModule}:${OverrideVerb}`, Choice>>;

export const cellKey = (module: OverridableModule, verb: OverrideVerb) =>
  `${module}:${verb}` as const;

export function choicesFrom(overrides: readonly PermissionOverride[]): Choices {
  return Object.fromEntries(
    overrides.map((o) => [cellKey(o.module, o.verb), o.allowed ? "allow" : "deny"]),
  );
}

/**
 * The overrides to save: only cells that differ from the level's default — an
 * "Allow" of something the level already allows is no override.
 */
export function overridesFrom(level: AccessLevel, choices: Choices): PermissionOverride[] {
  return OVERRIDABLE_MODULES.flatMap((module) =>
    OVERRIDE_VERBS.flatMap((verb): PermissionOverride[] => {
      const choice = choices[cellKey(module, verb)];
      if (!choice) return [];
      const allowed = choice === "allow";
      return allowed === levelAllows(level, module, verb) ? [] : [{ module, verb, allowed }];
    }),
  );
}

/** What the level gives without an override. */
export function levelAllows(level: AccessLevel, module: OverridableModule, verb: OverrideVerb) {
  return canInProject(level, `${module}:${verb}`);
}
