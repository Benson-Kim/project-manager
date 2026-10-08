import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { QuestionAnswerSheet } from "@/modules/questions-answers/components/question-answer-sheet";
import { QuestionsAnswersView } from "@/modules/questions-answers/components/questions-answers-view";
import {
  getQuestionAnswerById,
  listQuestionAnswers,
} from "@/modules/questions-answers/repository/question-answers";
import { getProjectById } from "@/modules/projects/repository/projects";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.questionsAnswers.title} — ${messages.app.name}`,
};

/**
 * Questions & Answers list — project-scoped section under
 * /projects/[id]/questions-answers; DataView + search + category/priority filters;
 * detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: Question asc.
 */
export default async function QuestionsAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  // Validate the parent project exists before listing child records (P2 guard).
  try {
    await getProjectById(projectId, session.userId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "Question",
  };

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const filters = {
    category: flat.category ?? null,
    priority: flat.priority ?? null,
  };

  const [rows, preferredView, selectedRaw] = await Promise.all([
    listQuestionAnswers(effectiveParams, session.userId, projectId, filters, undefined, session.role),
    getViewPreference(session.userId, "questions-answers").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getQuestionAnswerById(selectedId, session.userId, session.role).catch((err) => {
          if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN_ROW")) return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  // Cross-project leak guard: deep links to another project's Q&A yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "questions-answers:create");
  const canEdit = can(session.role, "questions-answers:update");
  const canDelete = can(session.role, "questions-answers:delete");
  const filtersActive = Boolean(effectiveParams.q || flat.category || flat.priority);

  const newQuestionLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/questions-answers`, flat)}
      data-testid="new-question-answer"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.questionsAnswers.newQuestion}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.questionsAnswers.title}
        action={canCreate ? newQuestionLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <QuestionsAnswersView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newQuestionAction={canCreate ? newQuestionLink : undefined}
        />
      </div>
      <QuestionAnswerSheet
        questionAnswer={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
