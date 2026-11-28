import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { currencyOrNone, NO_CURRENCY } from "@/lib/currency/currencies";
import { listParamsSchema } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { ProjectMath } from "@/modules/financials/components/project-math/project-math";
import { listFinancials } from "@/modules/financials/repository/financials";
import { getProjectMathState } from "@/modules/financials/repository/project-math-state";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.financials.projectMath.title} · ${messages.financials.title} — ${messages.app.name}`,
};

const idSchema = z.coerce.number().int().positive();

/** The project's currency: the open financial's (?f=<id>), else the first financial that has one. */
export default async function ProjectMathPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const projectId = parseProjectId((await params).id);
  if (projectId === null) notFound();
  const raw = (await searchParams).f;
  const picked = idSchema.safeParse(Array.isArray(raw) ? raw[0] : raw);

  const [rows, saved, allows] = await Promise.all([
    orNotFound(listFinancials(listParamsSchema.parse({}), session.userId, projectId, 100)),
    getProjectMathState(projectId, session.userId),
    getProjectPermissions(projectId, session.userId),
  ]);
  const currencies = rows.map((row) => ({
    id: row.FinancialId,
    currency: currencyOrNone(row.CurrencyCode),
  }));
  const open = picked.success ? currencies.find((row) => row.id === picked.data) : undefined;
  const currency =
    open?.currency ||
    currencies.find((row) => row.currency !== NO_CURRENCY)?.currency ||
    NO_CURRENCY;

  return (
    <ProjectMath
      projectId={projectId}
      currency={currency}
      saved={saved}
      canSave={allows("financials:update")}
    />
  );
}
