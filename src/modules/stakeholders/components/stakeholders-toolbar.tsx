"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { ENGAGEMENT_LEVELS } from "../schemas/stakeholder";
import type { ProjectOption } from "./stakeholder-sheet";

/**
 * Stakeholders toolbar: debounced search (usp_Stakeholder_List @Search) +
 * project and engagement-level filters forwarded 1:1 to the proc.
 */
export function StakeholdersToolbar({ projects }: { projects: ProjectOption[] }) {
  const { searchParams, update } = useListUrlState();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update({ q: value || null }), 250);
  };

  return (
    <Toolbar>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{messages.list.search}</span>
        <input
          type="search"
          autoComplete="off"
          placeholder={messages.list.search}
          data-testid="stakeholders-search"
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">{messages.stakeholders.project}</span>
        <Select
          name="project"
          data-testid="filter-project"
          value={searchParams.get("project") ?? ""}
          onChange={(e) => update({ project: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.stakeholders.allProjects}</option>
          {projects.map((p) => (
            <option key={p.ProjectId} value={p.ProjectId}>
              {p.ProjectName}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="sr-only">{messages.stakeholders.engagementLevel}</span>
        <Select
          name="engagement"
          data-testid="filter-engagement"
          value={searchParams.get("engagement") ?? ""}
          onChange={(e) => update({ engagement: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.stakeholders.allEngagementLevels}</option>
          {ENGAGEMENT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </label>
    </Toolbar>
  );
}
