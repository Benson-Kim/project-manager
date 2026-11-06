"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select, Textarea } from "@/components/ui/form/inputs";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/form/multi-select";
import type { ActionResult } from "@/lib/action";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  createRequirementLinkAction,
  deleteRequirementLinkAction,
  updateRequirementLinkAction,
} from "../actions";
import { linkCandidates, type LinkRule } from "../schemas/link-rules";
import type { RequirementOption, RequirementRow } from "../schemas/requirement";
import {
  LINK_RATIONALE_MAX,
  LINK_STATUSES,
  linkEnds,
  type LinkStatus,
  type RequirementLink,
} from "../schemas/requirement-link";
import { linkChoice } from "./requirement-form";

const M = messages.requirements;

type Write = () => Promise<ActionResult<unknown>>;

/**
 * Every link of one requirement with its record (ADR-0060). It sits outside the form's <form>
 * because a link saves on its own, under its own version, not with the requirement.
 */
export function RequirementLinks({
  requirement,
  links,
  linkOptions,
  linkRules,
  deliverableOptions,
  canEdit,
}: {
  requirement: RequirementRow;
  links: readonly RequirementLink[];
  linkOptions: readonly RequirementOption[];
  linkRules: readonly LinkRule[];
  deliverableOptions: readonly MultiSelectOption[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (write: Write) =>
    start(async () => {
      const result = await write();
      setError(result.ok ? null : result.error.message);
    });

  const rowId = requirement.RequirementId;
  const { upstream, downstream } = linkCandidates(
    linkRules,
    { id: rowId, type: requirement.RequirementType },
    linkOptions,
    new Set(links.filter((l) => l.direction !== "Wbs").map((l) => l.linkedId)),
  );
  const labelOf = (link: RequirementLink) =>
    link.direction === "Wbs"
      ? (deliverableOptions.find((o) => o.id === link.linkedId)?.label ?? M.deliverables)
      : `${link.ref} ${link.text}`;

  const list = (direction: RequirementLink["direction"]) => (
    <ul className="space-y-2">
      {links
        .filter((link) => link.direction === direction)
        .map((link) => (
          <LinkRow
            key={`${link.direction}-${link.linkedId}-${link.rowVer}`}
            rowId={rowId}
            link={link}
            label={labelOf(link)}
            canEdit={canEdit}
            pending={pending}
            run={run}
          />
        ))}
    </ul>
  );
  const picker = (
    direction: string,
    options: readonly RequirementOption[],
    add: (id: number) => Write,
  ) =>
    canEdit ? (
      <Field label={M.addLink} name={`link-${direction}`}>
        <MultiSelect
          options={options.map(linkChoice)}
          selected={[]}
          disabled={pending}
          inputName={`link-${direction}`}
          removeLabel={M.removeChip}
          emptyPlaceholder={M.noLinkOptions}
          onAdd={(option) => run(add(option.id))}
          onRemove={() => undefined}
        />
      </Field>
    ) : null;

  return (
    <div
      className="mt-6 space-y-4 border-t border-border pt-4 text-sm"
      data-testid="requirement-links"
    >
      <ErrorSummary message={error} />
      <section className="space-y-2">
        <h3 className="font-medium">{M.validates}</h3>
        {list("Upstream")}
        {picker(
          "upstream",
          upstream,
          (id) => () =>
            createRequirementLinkAction({ requirementId: rowId, upstreamRequirementId: id }),
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">{M.validatedBy}</h3>
        {list("Downstream")}
        {picker(
          "downstream",
          downstream,
          (id) => () =>
            createRequirementLinkAction({ requirementId: id, upstreamRequirementId: rowId }),
        )}
      </section>
      {links.some((link) => link.direction === "Wbs") ? (
        <section className="space-y-2">
          <h3 className="font-medium">{M.deliverables}</h3>
          {list("Wbs")}
        </section>
      ) : null}
    </div>
  );
}

function LinkRow({
  rowId,
  link,
  label,
  canEdit,
  pending,
  run,
}: {
  rowId: number;
  link: RequirementLink;
  label: string;
  canEdit: boolean;
  pending: boolean;
  run: (write: Write) => void;
}) {
  const saved = link.rationale ?? "";
  const [rationale, setRationale] = useState(saved);
  const ends = linkEnds(rowId, link);
  const save = (status: LinkStatus) =>
    run(() =>
      updateRequirementLinkAction({ ...ends, rationale, linkStatus: status, rowVer: link.rowVer }),
    );
  const upstreamId = ends.upstreamRequirementId;

  return (
    <li className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 break-words">{label}</span>
        {canEdit && upstreamId !== null ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            aria-label={M.removeLink(label)}
            onClick={() =>
              run(() =>
                deleteRequirementLinkAction({
                  requirementId: ends.requirementId,
                  upstreamRequirementId: upstreamId,
                  rowVer: link.rowVer,
                }),
              )
            }
          >
            ×
          </Button>
        ) : null}
      </div>
      {canEdit ? (
        <>
          <Select
            aria-label={M.linkStatus}
            value={link.status}
            disabled={pending}
            onChange={(event) => save(event.target.value as LinkStatus)}
          >
            {LINK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
          <Textarea
            aria-label={M.linkRationale}
            rows={2}
            maxLength={LINK_RATIONALE_MAX}
            value={rationale}
            disabled={pending}
            onChange={(event) => setRationale(event.target.value)}
            onBlur={() => {
              if (rationale.trim() !== saved) save(link.status);
            }}
          />
        </>
      ) : (
        <>
          <p>{link.status}</p>
          {saved ? <p className="whitespace-pre-wrap break-words">{saved}</p> : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {M.linkAdded(formatDate(link.createdAt), link.createdByName)}
      </p>
    </li>
  );
}
