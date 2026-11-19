"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { messages } from "@/lib/messages";
import {
  GOVERNANCE_LOGS,
  governanceLogOf,
  governanceLogRecordHref,
  type GovernanceLogKind,
} from "../governance-logs";
import type { WorkspaceActionItem } from "../schemas/meeting";
import { useMinutes } from "./minutes-context";

const M = messages.meetings;

/**
 * The logs an action is recorded in: a chip per linked record, opening it in
 * its log, and a "Log in" list that ticks or unticks each log. A log the user
 * may not write to stays as it is.
 */
export function ActionLogLinks({ action, name }: { action: WorkspaceActionItem; name: string }) {
  const { projectId, busy, logKinds, setLogLinks } = useMinutes();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const linked = action.LogLinksJson.map((link) => link.LogKind);

  const toggle = (kind: GovernanceLogKind) => {
    if (busy) return;
    const next = linked.includes(kind) ? linked.filter((k) => k !== kind) : [...linked, kind];
    setLogLinks(action, next, name);
  };

  if (action.LogLinksJson.length === 0 && logKinds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="action-log-links">
      {action.LogLinksJson.map((link) => (
        <Link
          key={link.LogKind}
          href={governanceLogRecordHref(projectId, link.LogKind, link.RecordId)}
          className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs text-accent hover:underline"
          data-testid="action-log-chip"
        >
          {governanceLogOf(link.LogKind).label}
        </Link>
      ))}
      {logKinds.length > 0 ? (
        <div className="relative print:hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={M.logInOf(name)}
            className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-surface-sunken"
            onClick={() => setOpen((value) => !value)}
          >
            {M.logIn}
          </button>
          {open ? (
            <fieldset
              id={listId}
              aria-label={M.logInOf(name)}
              className="absolute z-20 mt-1 flex min-w-56 flex-col rounded-md border border-line bg-surface shadow-md"
            >
              {GOVERNANCE_LOGS.filter((log) => logKinds.includes(log.kind)).map((log) => (
                <label
                  key={log.kind}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink first:rounded-t-md last:rounded-b-md hover:bg-surface-sunken"
                >
                  <input
                    type="checkbox"
                    checked={linked.includes(log.kind)}
                    aria-disabled={busy || undefined}
                    onChange={() => toggle(log.kind)}
                  />
                  {log.label}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
