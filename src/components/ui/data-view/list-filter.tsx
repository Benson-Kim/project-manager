"use client";

import type { LookupListKey } from "@/lib/lookup-lists";
import { Select } from "../form/inputs";
import { ListOptions } from "../lookup-lists";
import { useListUrlState } from "./use-list-url-state";

/**
 * A toolbar filter bound to a managed dropdown list (ADR-0022): offers the
 * list's live options and keeps the choice in the URL (`?<param>=`), which the
 * page forwards to its list proc. Every list module's status/priority/… filter.
 */
export function ListFilter({
  list,
  param,
  label,
  allLabel,
  testId,
}: {
  list: LookupListKey;
  /** URL parameter, e.g. "status". */
  param: string;
  /** Accessible name (the column header). */
  label: string;
  /** The "no filter" option, e.g. "All statuses". */
  allLabel: string;
  testId?: string;
}) {
  const { searchParams, update } = useListUrlState();
  const value = searchParams.get(param) ?? "";
  return (
    <label>
      <span className="sr-only">{label}</span>
      <Select
        name={param}
        data-testid={testId}
        value={value}
        onChange={(e) => update({ [param]: e.target.value || null, page: null })}
        className="w-auto"
      >
        <option value="">{allLabel}</option>
        <ListOptions list={list} current={value || null} />
      </Select>
    </label>
  );
}
