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
import { KeywordSheet } from "@/modules/keywords/components/keyword-sheet";
import { KeywordsView } from "@/modules/keywords/components/keywords-view";
import { listKeywords, getKeywordById } from "@/modules/keywords/repository/keywords";
import { getProjectById } from "@/modules/projects/repository/projects";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.keywords.title} — ${messages.app.name}`,
};

/**
 * Keywords list project-scoped section under
 * /projects/[id]/keywords; DataView + search, detail/edit in the
 * URL-synced Sheet (?id=<n> | ?id=new). Default sort: Keyword asc.
 */
export default async function KeywordsPage({
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

  // Validate that the parent project exists and is accessible before listing
  // child records. An unknown/soft-deleted project yields 404 rather than an
  // empty keywords list or a confusing FK error on create (P2 review finding).
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
    sort: listParams.sort ?? "Keyword",
  };

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const [rows, preferredView, selectedRaw] = await Promise.all([
    listKeywords(effectiveParams, session.userId, projectId),
    getViewPreference(session.userId, "keywords").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getKeywordById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  // A deep link to a keyword from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "keywords:create");
  const canEdit = can(session.role, "keywords:update");
  const canDelete = can(session.role, "keywords:delete");
  const filtersActive = Boolean(effectiveParams.q);

  const newKeywordLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/keywords`, flat)}
      data-testid="new-keyword"
      className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent"
    >
      {messages.keywords.newKeyword}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.keywords.title}
        action={canCreate ? newKeywordLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <KeywordsView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newKeywordAction={canCreate ? newKeywordLink : undefined}
        />
      </div>
      <KeywordSheet
        keyword={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
