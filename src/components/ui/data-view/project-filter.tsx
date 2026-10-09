"use client";

import { messages } from "@/lib/messages";
import { Select } from "../form/inputs";
import { useListUrlState } from "./use-list-url-state";

/**
 * The project filter of a cross-project list (/daily-activities, /todo): All
 * projects, No project (the project-less shared space), or one project the
 * actor can see. Kept in the URL (`?project=<id>|none`); the page validates it
 * against the same options before it reaches the list proc.
 */
export function ProjectFilter({
  options,
  testId = "filter-project",
}: {
  options: readonly { id: number; name: string }[];
  testId?: string;
}) {
  const { searchParams, update } = useListUrlState();
  return (
    <label>
      <span className="sr-only">{messages.projectPicker.filter}</span>
      <Select
        name="project"
        data-testid={testId}
        value={searchParams.get("project") ?? ""}
        onChange={(e) => update({ project: e.target.value || null, page: null })}
        className="w-auto max-w-56"
      >
        <option value="">{messages.projectPicker.all}</option>
        <option value="none">{messages.projectPicker.none}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
