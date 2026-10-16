import { execProc } from "@/lib/db";
import type { z } from "zod";
import {
  templateRowSchema,
  toTemplate,
  type saveTemplateInput,
  type Template,
  type TemplateRow,
} from "../schemas/template";

/**
 * Master financial templates (ADR-0029) — stored procedures only. Any active
 * user lists and reads them; only Admins save or delete (checked in the procs
 * and by the action's "admin:financial-templates" permission).
 */

export async function listTemplates(actorUserId: number): Promise<Template[]> {
  const rows = await execProc<TemplateRow>("usp_FinancialTemplate_List", {
    ActorUserId: actorUserId,
  });
  return rows.map((r) => toTemplate(templateRowSchema.parse(r)));
}

export async function getTemplate(templateId: number, actorUserId: number): Promise<Template> {
  const rows = await execProc<TemplateRow>("usp_FinancialTemplate_GetById", {
    FinancialTemplateId: templateId,
    ActorUserId: actorUserId,
  });
  return toTemplate(templateRowSchema.parse(rows[0]));
}

export async function saveTemplate(
  parsed: z.output<typeof saveTemplateInput>,
  actorUserId: number,
): Promise<Template> {
  const rows = await execProc<TemplateRow>("usp_FinancialTemplate_Save", {
    FinancialTemplateId: parsed.templateId,
    Name: parsed.name,
    Definition: JSON.stringify(parsed.definition),
    IsDefault: parsed.isDefault,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return toTemplate(templateRowSchema.parse(rows[0]));
}

export async function deleteTemplate(
  templateId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_FinancialTemplate_Delete", {
    FinancialTemplateId: templateId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
