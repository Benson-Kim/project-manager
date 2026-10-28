"use client";

import { PackageRequirementsButton } from "@/modules/boards/components/package-requirements";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { buttonClass } from "@/components/ui/button-styles";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { REQUIREMENT_TYPES, typeLabel } from "../schemas/requirement-types";

/**
 * Requirements toolbar: search + type filter + the two exports + view toggle
 * (passed as children by DataView's renderToolbar). The filter also sets the
 * type a new row starts with, and narrows what the exports contain, so what
 * downloads is what the register is showing. The route scopes the project.
 */
export function RequirementsToolbar({
  projectId,
  children,
}: {
  projectId: number;
  children?: React.ReactNode;
}) {
  const { searchParams, update } = useListUrlState();
  const type = searchParams.get("type");
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const base = `/projects/${projectId}/requirements`;

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
      <a
        href={`${base}/export${query}`}
        className={buttonClass("ghost")}
        data-testid="export-requirements-csv"
      >
        {messages.requirements.exportCsv}
      </a>
      <a
        href={`${base}/pdf${query}`}
        className={buttonClass("ghost")}
        data-testid="export-requirements-pdf"
      >
        {messages.requirements.exportPdf}
      </a>
      <PackageRequirementsButton projectId={projectId} />
      {children}
    </Toolbar>
  );
}
