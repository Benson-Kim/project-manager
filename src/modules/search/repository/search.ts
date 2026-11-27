import { execProc } from "@/lib/db";
import {
  SEARCH_KIND_REGISTRY,
  globalSearchInput,
  groupSearchHits,
  searchHitSchema,
  searchProcRowSchema,
  type GlobalSearchInput,
  type GlobalSearchResult,
} from "../schemas/search";

/**
 * Global search repository — stored procedures only, zod row parsing
 * at the boundary, requests topPerKind + 1 per kind to compute hasMore
 * without an extra COUNT(*) scan.
 */
export async function searchGlobal(
  input: GlobalSearchInput,
  actorUserId: number,
): Promise<GlobalSearchResult> {
  const parsed = globalSearchInput.parse(input);
  const fetchTopPerKind = parsed.topPerKind + 1;
  const kindsParam = parsed.kinds ? parsed.kinds.join(",") : null;

  const rawRows = await execProc("usp_Search_Global", {
    ActorUserId: actorUserId,
    Search: parsed.q,
    Kinds: kindsParam,
    TopPerKind: fetchTopPerKind,
  });

  const hits = rawRows.map((raw) => {
    const row = searchProcRowSchema.parse(raw);
    const meta = SEARCH_KIND_REGISTRY[row.Kind];
    return searchHitSchema.parse({
      kind: row.Kind,
      id: row.Id,
      projectId: row.ProjectId,
      projectName: row.ProjectName,
      title: row.Title,
      snippet: row.Snippet,
      href: meta.buildHref(row.ProjectId, row.Id, parsed.q),
    });
  });

  return groupSearchHits(parsed.q, hits, parsed.kinds, parsed.topPerKind);
}
