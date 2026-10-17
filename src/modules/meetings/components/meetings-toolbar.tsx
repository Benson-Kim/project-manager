"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { DatePicker } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

const M = messages.meetings;

/**
 * Meetings toolbar: search (title, location, objective), the meeting-date
 * range (?from=, ?to=, inclusive days) and the view toggle. The page reads
 * the URL and passes the filters to usp_Meeting_List.
 */
export function MeetingsToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();
  return (
    <Toolbar>
      <SearchInput testId="meetings-search" />
      <DateFilter
        param="from"
        label={M.dateFrom}
        value={searchParams.get("from") ?? ""}
        onChange={(value) => update({ from: value || null })}
      />
      <DateFilter
        param="to"
        label={M.dateTo}
        value={searchParams.get("to") ?? ""}
        onChange={(value) => update({ to: value || null })}
      />
      {children}
    </Toolbar>
  );
}

function DateFilter({
  param,
  label,
  value,
  onChange,
}: {
  param: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="whitespace-nowrap">{label}</span>
      <DatePicker
        name={param}
        value={value}
        data-testid={`filter-${param}`}
        onChange={(event) => onChange(event.target.value)}
        className="w-auto"
      />
    </label>
  );
}
