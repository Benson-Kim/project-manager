import type { Metadata } from "next";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { SearchWorkspace } from "@/modules/search/components/search-workspace";
import { searchGlobal } from "@/modules/search/repository/search";
import {
  SEARCH_DEFAULT_TOP_PER_KIND,
  parseSearchQueryParams,
  type GlobalSearchResult,
} from "@/modules/search/schemas/search";

export const metadata: Metadata = {
  title: `${messages.search.title} — ${messages.app.name}`,
};

/**
 * Global search across all accessible projects (keywords, stakeholders, suppliers).
 * Per-session SSR via auth.requireSession(); validates ?q= and ?kinds= safely
 * before touching SQL Server.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const parsed = parseSearchQueryParams(raw);

  let initialResult: GlobalSearchResult | null = null;
  let initialError: string | null = null;
  let initialActionError = false;

  if (parsed.status === "invalid") {
    initialError = parsed.validationError;
  } else if (parsed.status === "ready") {
    try {
      initialResult = await searchGlobal(
        {
          q: parsed.q,
          kinds: parsed.kinds,
          topPerKind: SEARCH_DEFAULT_TOP_PER_KIND,
        },
        session.userId,
      );
    } catch {
      initialActionError = true;
    }
  }

  return (
    <>
      <h1 className="sr-only">{messages.search.title}</h1>
      <div className="mt-3 flex flex-1 flex-col">
        <SearchWorkspace
          initialQuery={parsed.q}
          initialKinds={parsed.kinds}
          initialResult={initialResult}
          initialPrompt={
            parsed.status === "empty" || parsed.status === "too_short" ? parsed.status : null
          }
          initialError={initialError}
          initialActionError={initialActionError}
        />
      </div>
    </>
  );
}
