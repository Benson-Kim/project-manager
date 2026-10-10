import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams, initialViewOf } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { QuestionAnswerSheet } from "@/modules/questions-answers/components/question-answer-sheet";
import { QuestionsAnswersView } from "@/modules/questions-answers/components/questions-answers-view";
import {
  getQuestionAnswerById,
  listQuestionAnswers,
} from "@/modules/questions-answers/repository/question-answers";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { QUESTION_ANSWER_LISTS } from "@/modules/questions-answers/schemas/question-answer";

/** Allowed sort columns for Q&A — prevents arbitrary strings reaching the proc. */
const QA_SORT_COLUMNS = new Set(["Question", "Answer", "Category", "Priority", "CreatedAtUtc"]);

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

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    // Whitelist sort column to prevent arbitrary strings reaching the proc.
    sort: listParams.sort && QA_SORT_COLUMNS.has(listParams.sort) ? listParams.sort : "Question",
  };

  const isNew = flat.id === "new";
  const rawId = !isNew && flat.id ? Number(flat.id) : null;
  // Guard against Infinity (e.g. "1e308") and non-integers before hitting the DB.
  const selectedId =
    rawId !== null && Number.isFinite(rawId) && Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  // Coerce empty-string filter params to null so the proc treats them as
  // "no filter" rather than filtering for the empty string.
  const filters = {
    category: flat.category?.trim() || null,
    priority: flat.priority?.trim() || null,
  };

  const [rows, preference, selectedRaw, allows, lookup] = await Promise.all([
    orNotFound(listQuestionAnswers(effectiveParams, session.userId, projectId, filters)),
    getListPreference(session.userId, "questions-answers").catch(() => null),
    selectedId ? orNull(getQuestionAnswerById(selectedId, session.userId)) : null,
    getProjectPermissions(projectId, session.userId),
    loadLookupLists(QUESTION_ANSWER_LISTS, session),
  ]);

  // Cross-project leak guard: deep links to another project's Q&A yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("questions-answers:create");
  const canEdit = allows("questions-answers:update");
  const canDelete = allows("questions-answers:delete");
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
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <QuestionsAnswersView
            projectId={projectId}
            canCreate={canCreate}
            rows={rows}
            totalCount={totalCount}
            page={effectiveParams.page}
            initialView={initialViewOf(effectiveParams.view, preference?.viewMode)}
            layout={preference?.layout}
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
      </LookupListsScope>
    </>
  );
}
