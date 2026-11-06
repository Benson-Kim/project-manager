"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { messages } from "@/lib/messages";
import { setLinkRuleAction } from "../actions";
import {
  allowsLink,
  LINK_UPSTREAM_TYPES,
  withLinkRule,
  type LinkRule,
  type LinkUpstreamType,
  type SetLinkRuleInput,
} from "../schemas/link-rules";
import { REQUIREMENT_TYPES, typeLabel } from "../schemas/requirement-types";

const L = messages.settings.linkRules;

function upstreamLabel(type: LinkUpstreamType): string {
  return type === "WBS" ? L.wbs : typeLabel(type);
}

/** One tick per allowed link. Each cell saves itself, and a refused save puts the tick back. */
export function LinkRulesMatrix({ rules }: { rules: readonly LinkRule[] }) {
  const [shown, show] = useOptimistic(rules, withLinkRule);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(change: SetLinkRuleInput) {
    setError(null);
    start(async () => {
      show(change);
      try {
        const result = await setLinkRuleAction(change);
        if (!result.ok) setError(result.error.message);
      } catch {
        setError(messages.errors.INTERNAL);
      }
    });
  }

  return (
    <>
      <ErrorSummary message={error} />
      <div className="overflow-x-auto">
        <table data-testid="link-rules-matrix" className="w-full text-left text-sm">
          <caption className="sr-only">{L.title}</caption>
          <thead className="text-ink-muted">
            <tr>
              <td />
              <th
                scope="colgroup"
                colSpan={LINK_UPSTREAM_TYPES.length}
                className="px-2 py-2 text-center font-medium"
              >
                {L.linksUpTo}
              </th>
            </tr>
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                {L.requirementType}
              </th>
              {LINK_UPSTREAM_TYPES.map((upstreamType) => (
                <th key={upstreamType} scope="col" className="px-2 py-2 text-center font-medium">
                  {upstreamLabel(upstreamType)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REQUIREMENT_TYPES.map((downstreamType) => (
              <tr key={downstreamType} className="border-t border-line">
                <th scope="row" className="py-2 pr-4 font-medium text-ink">
                  {typeLabel(downstreamType)}
                </th>
                {LINK_UPSTREAM_TYPES.map((upstreamType) => (
                  <td key={upstreamType} className="px-2">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label={L.cell(typeLabel(downstreamType), upstreamLabel(upstreamType))}
                        checked={allowsLink(shown, downstreamType, upstreamType)}
                        onChange={(event) =>
                          save({ downstreamType, upstreamType, allowed: event.target.checked })
                        }
                        className="size-5"
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
