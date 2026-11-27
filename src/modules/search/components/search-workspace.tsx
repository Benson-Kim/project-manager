"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ProjectLink } from "@/components/ui/project-link";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { messages } from "@/lib/messages";
import { searchGlobalAction } from "../actions";
import {
  SEARCH_DEFAULT_TOP_PER_KIND,
  SEARCH_KINDS,
  SEARCH_KIND_REGISTRY,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  buildSearchPageHref,
  type GlobalSearchResult,
  type SearchKind,
} from "../schemas/search";

export interface SearchWorkspaceProps {
  initialQuery: string;
  initialKinds: SearchKind[] | undefined;
  initialResult: GlobalSearchResult | null;
  initialPrompt: "empty" | "too_short" | null;
  initialError: string | null;
  initialActionError?: boolean;
}

export function SearchWorkspace({
  initialQuery,
  initialKinds,
  initialResult,
  initialPrompt,
  initialError,
  initialActionError = false,
}: SearchWorkspaceProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedKinds, setSelectedKinds] = useState<SearchKind[] | undefined>(initialKinds);
  const [result, setResult] = useState<GlobalSearchResult | null>(initialResult);
  const [prompt, setPrompt] = useState<"empty" | "too_short" | null>(initialPrompt);
  const [error, setError] = useState<string | null>(initialError);
  const [actionFailed, setActionFailed] = useState(initialActionError);
  const [pending, setPending] = useState(false);

  const initialKey = `${initialQuery}\0${(initialKinds ?? []).join(",")}\0${initialPrompt ?? ""}\0${initialError ?? ""}\0${initialActionError}`;
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setQuery(initialQuery);
    setSelectedKinds(initialKinds);
    setResult(initialResult);
    setPrompt(initialPrompt);
    setError(initialError);
    setActionFailed(initialActionError);
    setPending(false);
  }

  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function syncUrl(rawQuery: string, kinds: SearchKind[] | undefined) {
    const href = buildSearchPageHref(rawQuery, kinds);
    window.history.replaceState(null, "", href);
  }

  async function executeSearch(rawQuery: string, kinds: SearchKind[] | undefined) {
    const trimmed = rawQuery.trim();
    const reqId = ++requestSeqRef.current;

    if (trimmed.length === 0) {
      setResult(null);
      setError(null);
      setActionFailed(false);
      setPrompt("empty");
      setPending(false);
      return;
    }
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setResult(null);
      setError(null);
      setActionFailed(false);
      setPrompt("too_short");
      setPending(false);
      return;
    }
    if (trimmed.length > SEARCH_MAX_LENGTH) {
      setResult(null);
      setPrompt(null);
      setActionFailed(false);
      setError(messages.search.maxLength);
      setPending(false);
      return;
    }

    setPrompt(null);
    setError(null);
    setActionFailed(false);
    setPending(true);

    const res = await searchGlobalAction({
      q: trimmed,
      kinds,
      topPerKind: SEARCH_DEFAULT_TOP_PER_KIND,
    });
    if (reqId !== requestSeqRef.current) return;

    setPending(false);
    if (!res.ok) {
      setResult(null);
      if (res.error.code === "VALIDATION") {
        setError(res.error.message);
      } else {
        setActionFailed(true);
      }
      return;
    }
    setResult(res.data);
  }

  function onQueryChange(nextValue: string) {
    setQuery(nextValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      syncUrl(nextValue, selectedKinds);
      void executeSearch(nextValue, selectedKinds);
    }, 250);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    syncUrl(query, selectedKinds);
    void executeSearch(query, selectedKinds);
  }

  function pickAllKinds() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedKinds(undefined);
    syncUrl(query, undefined);
    void executeSearch(query, undefined);
  }

  function toggleKind(kind: SearchKind) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let next: SearchKind[] | undefined;
    if (!selectedKinds) {
      next = [kind];
    } else if (selectedKinds.includes(kind)) {
      const remaining = selectedKinds.filter((item) => item !== kind);
      next = remaining.length === 0 ? undefined : remaining;
    } else {
      const combined = SEARCH_KINDS.filter((item) => selectedKinds.includes(item) || item === kind);
      next = combined.length === SEARCH_KINDS.length ? undefined : combined;
    }
    setSelectedKinds(next);
    syncUrl(query, next);
    void executeSearch(query, next);
  }

  const nonEmptyGroups = result ? result.groups.filter((g) => g.hits.length > 0) : [];
  const totalHits = nonEmptyGroups.reduce((sum, g) => sum + g.hits.length, 0);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <section className="rounded-xl border border-line bg-surface p-4 shadow-xs">
        <form
          role="search"
          aria-label={messages.search.queryLabel}
          data-testid="search-page-form"
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={onSubmit}
        >
          <label htmlFor={inputId} className="sr-only">
            {messages.search.queryLabel}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            name="q"
            autoComplete="off"
            placeholder={messages.search.placeholder}
            data-testid="search-page-input"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button
            type="submit"
            data-testid="search-page-submit"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-active"
          >
            {messages.search.submit}
          </button>
        </form>

        <div
          role="group"
          aria-label={messages.list.filter}
          data-testid="search-kind-filters"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={selectedKinds === undefined}
            data-testid="search-filter-all"
            onClick={pickAllKinds}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
              selectedKinds === undefined
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-line bg-surface text-ink-muted hover:bg-hover hover:text-ink"
            }`}
          >
            {messages.search.allKinds}
          </button>
          {SEARCH_KINDS.map((kind) => {
            const active = selectedKinds?.includes(kind) ?? false;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                data-testid={`search-filter-${kind}`}
                onClick={() => toggleKind(kind)}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent-soft text-accent-strong"
                    : "border-line bg-surface text-ink-muted hover:bg-hover hover:text-ink"
                }`}
              >
                {SEARCH_KIND_REGISTRY[kind].label()}
              </button>
            );
          })}
          {pending ? (
            <span className="ml-auto text-xs text-ink-muted" role="status">
              {messages.app.loading}
            </span>
          ) : result ? (
            <span
              className="ml-auto text-xs text-ink-muted"
              role="status"
              data-testid="search-total-count"
            >
              {messages.search.count(totalHits)}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          data-testid="search-validation-error"
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </div>
      ) : actionFailed ? (
        <ErrorState
          title={messages.search.errorBody}
          onRetry={() => void executeSearch(query, selectedKinds)}
        />
      ) : prompt ? (
        <div data-testid="search-prompt">
          <EmptyState title={messages.search.title} body={messages.search.minLength} />
        </div>
      ) : result && nonEmptyGroups.length === 0 ? (
        <div data-testid="search-empty-results">
          <EmptyState title={messages.search.noResultsTitle} body={messages.search.noResultsBody} />
        </div>
      ) : (
        <div className="flex flex-col gap-6" data-testid="search-results">
          {nonEmptyGroups.map((group) => {
            const headingId = `search-heading-${group.kind}`;
            return (
              <section
                key={group.kind}
                aria-labelledby={headingId}
                data-testid={`search-group-${group.kind}`}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 id={headingId} className="text-base font-semibold text-ink">
                      {SEARCH_KIND_REGISTRY[group.kind].label()}
                    </h2>
                    <span className="inline-flex items-center rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                      {messages.search.count(group.hits.length)}
                    </span>
                  </div>
                  {group.hasMore ? (
                    <p
                      data-testid={`search-has-more-${group.kind}`}
                      className="text-xs text-ink-muted"
                    >
                      {messages.search.hasMore(SEARCH_DEFAULT_TOP_PER_KIND)}
                    </p>
                  ) : null}
                </div>

                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.hits.map((hit) => (
                    <li
                      key={`${hit.kind}-${hit.id}`}
                      data-testid={`search-hit-${hit.kind}-${hit.id}`}
                      className="flex flex-col justify-between gap-2 rounded-lg border border-line bg-surface p-3.5 transition-colors hover:bg-hover/40"
                    >
                      {hit.href !== null && hit.projectId !== null ? (
                        <>
                          <Link
                            href={hit.href}
                            data-testid={`search-hit-link-${hit.kind}-${hit.id}`}
                            className="group flex flex-col gap-1 focus-visible:rounded-sm"
                          >
                            <span className="text-sm font-semibold text-ink group-hover:text-accent">
                              {hit.title}
                            </span>
                            {hit.snippet ? (
                              <span className="line-clamp-2 text-xs text-ink-muted">
                                {hit.snippet}
                              </span>
                            ) : null}
                          </Link>
                          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs text-ink-muted">
                            <ProjectLink
                              projectId={hit.projectId}
                              className="truncate font-medium text-accent hover:underline"
                            >
                              {hit.projectName}
                            </ProjectLink>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-ink">{hit.title}</span>
                            {hit.snippet ? (
                              <span className="line-clamp-2 text-xs text-ink-muted">
                                {hit.snippet}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs text-ink-muted">
                            <span className="inline-flex items-center rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                              <ProjectLink projectId={null}>
                                {messages.search.noProject}
                              </ProjectLink>
                            </span>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
