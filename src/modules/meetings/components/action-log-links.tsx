"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const linked = action.LogLinksJson.map((link) => link.LogKind);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = (kind: GovernanceLogKind) => {
    if (busy) return;
    const next = linked.includes(kind) ? linked.filter((k) => k !== kind) : [...linked, kind];
    setLogLinks(action, next, name);
  };

  if (action.LogLinksJson.length === 0 && logKinds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="action-log-links">
      {action.LogLinksJson.map((link) => (
        <span
          key={link.LogKind}
          className="group inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-2 py-0.5 text-xs text-indigo-700 transition-colors hover:border-indigo-300"
        >
          <Link
            href={governanceLogRecordHref(projectId, link.LogKind, link.RecordId)}
            className="font-medium hover:underline"
            data-testid="action-log-chip"
          >
            {governanceLogOf(link.LogKind).label}
          </Link>
          <button
            type="button"
            aria-label={`Unlink ${governanceLogOf(link.LogKind).label}`}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(link.LogKind);
            }}
            className="rounded p-0.5 text-indigo-400 hover:text-danger hover:bg-surface-soft text-xs leading-none transition-colors"
            title="Unlink"
          >
            ×
          </button>
        </span>
      ))}

      {logKinds.length > 0 ? (
        <div className="print:hidden">
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={M.logInOf(name)}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:bg-surface-soft shadow-xs"
            onClick={() => setOpen((value) => !value)}
          >
            + {M.logIn}
          </button>

          {open ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                id={listId}
                role="dialog"
                aria-modal="true"
                aria-label={M.logInOf(name)}
                className="flex w-full max-w-md flex-col rounded-xl border border-line bg-surface p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{M.logInOf(name)}</h4>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Select governance logs to link with this action item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink transition-colors"
                    aria-label="Close"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <fieldset className="flex flex-col gap-2 py-4">
                  <legend className="sr-only">{M.logInOf(name)}</legend>
                  {GOVERNANCE_LOGS.filter((log) => logKinds.includes(log.kind)).map((log) => {
                    const isTicked = linked.includes(log.kind);
                    return (
                      <label
                        key={log.kind}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                          isTicked
                            ? "border-accent bg-accent-soft/30 text-ink font-medium"
                            : "border-line bg-surface hover:bg-surface-soft text-ink"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isTicked}
                            aria-disabled={busy || undefined}
                            onChange={() => toggle(log.kind)}
                            className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                          />
                          <span className="font-medium">{log.label}</span>
                        </div>
                        {isTicked ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                            Linked
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </fieldset>

                <div className="flex justify-end pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-surface-raised border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-surface-sunken transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
