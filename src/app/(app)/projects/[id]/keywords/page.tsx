import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { KeywordSheet } from "@/modules/keywords/components/keyword-sheet";
import { KeywordsView } from "@/modules/keywords/components/keywords-view";
import { listKeywords, getKeywordById } from "@/modules/keywords/repository/keywords";
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

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "Keyword",
  };

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const [rows, preferredView, selectedRaw, allows] = await Promise.all([
    orNotFound(listKeywords(effectiveParams, session.userId, projectId, undefined)),
    getViewPreference(session.userId, "keywords").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getKeywordById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to a keyword from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("keywords:create");
  const canEdit = allows("keywords:update");
  const canDelete = allows("keywords:delete");
  const filtersActive = Boolean(effectiveParams.q);

  const newKeywordLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/keywords`, flat)}
      data-testid="new-keyword"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.keywords.newKeyword}
    </Link>
  );

  return (
    <>
      <PageHeader title={messages.keywords.title} action={canCreate ? newKeywordLink : undefined} />
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
