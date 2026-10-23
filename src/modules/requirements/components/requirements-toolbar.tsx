"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { REQUIREMENT_TYPES, typeLabel } from "../schemas/requirement-types";

/**
 * Requirements toolbar: search + type filter + view toggle (passed as children by DataView's
 * renderToolbar). The filter also sets the type a new row starts with. The route scopes the project.
 */
export function RequirementsToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();

  return (
    <Toolbar>
      <SearchInput testId="requirements-search" />
      <label>
        <span className="sr-only">{messages.requirements.type}</span>
        <Select
          name="type"
          data-testid="filter-type"
          value={searchParams.get("type") ?? ""}
          onChange={(e) => update({ type: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.requirements.allTypes}</option>
          {REQUIREMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {messages.requirements.typeWithCode(typeLabel(type), type)}
            </option>
          ))}
        </Select>
      </label>
      {children}
    </Toolbar>
  );
}
