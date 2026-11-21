"use client";

import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputBase } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { readFind, replaceAll, replaceCurrent, setFind, stepFind } from "./find-replace";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./icons";

const M = messages.richText;

export interface FindRequest {
  replace: boolean;
  seed: string;
  /** Changes on every Ctrl+F / Ctrl+H, so a second press focuses the bar again. */
  id: number;
}

interface FindBarProps {
  editor: Editor;
  request: FindRequest;
  onClose: () => void;
}

const field = `${inputBase} min-w-0 flex-1 py-1`;

/**
 * Its inputs carry no name and stop their change events, so typing a search
 * neither submits nor dirties the surrounding form.
 */
export function FindBar({ editor, request, onClose }: FindBarProps) {
  const findRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(request.seed);
  const [replacement, setReplacement] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(request.replace);
  const { current, total } = useEditorState({
    editor,
    selector: ({ editor: e }) => readFind(e.state),
  });

  const [seenRequest, setSeenRequest] = useState(request);
  if (seenRequest !== request) {
    setSeenRequest(request);
    if (request.seed) setQuery(request.seed);
    if (request.replace) setReplaceOpen(true);
  }

  useEffect(() => {
    if (request.seed) setFind(editor.view, request.seed);
    findRef.current?.focus();
    findRef.current?.select();
  }, [editor, request]);

  useEffect(() => () => setFind(editor.view, ""), [editor]);

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  const onBarKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "f" || key === "h")) {
      event.preventDefault();
      if (key === "h") setReplaceOpen(true);
      findRef.current?.focus();
      findRef.current?.select();
    }
  };

  const status = !query ? "" : total ? M.matchCount(current + 1, total) : M.noMatches;

  return (
    <div
      role="search"
      aria-label={M.find}
      className="flex flex-col gap-1 border-b border-line bg-surface p-1"
      onKeyDown={onBarKeyDown}
    >
      <div className="flex items-center gap-1">
        <input
          ref={findRef}
          type="search"
          aria-label={M.find}
          placeholder={M.find}
          className={field}
          value={query}
          data-testid="find-input"
          onChange={(event) => {
            event.stopPropagation();
            setQuery(event.target.value);
            setFind(editor.view, event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            stepFind(editor.view, event.shiftKey ? -1 : 1);
          }}
        />
        <span role="status" className="min-w-16 text-xs text-ink-muted" data-testid="find-count">
          {status}
        </span>
        <Button
          variant="ghost"
          size="compact"
          aria-label={M.previousMatch}
          title={M.previousMatch}
          disabled={!total}
          onClick={() => stepFind(editor.view, -1)}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="compact"
          aria-label={M.nextMatch}
          title={M.nextMatch}
          disabled={!total}
          onClick={() => stepFind(editor.view, 1)}
        >
          <ChevronDownIcon />
        </Button>
        <Button
          variant="ghost"
          size="compact"
          aria-pressed={replaceOpen}
          onClick={() => setReplaceOpen((open) => !open)}
        >
          {M.showReplace}
        </Button>
        <Button
          variant="ghost"
          size="compact"
          aria-label={M.closeFind}
          title={M.closeFind}
          onClick={close}
        >
          <CloseIcon />
        </Button>
      </div>
      {replaceOpen ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            aria-label={M.replaceWith}
            placeholder={M.replaceWith}
            className={field}
            value={replacement}
            data-testid="replace-input"
            onChange={(event) => {
              event.stopPropagation();
              setReplacement(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              replaceCurrent(editor.view, replacement);
            }}
          />
          <Button
            variant="secondary"
            size="compact"
            disabled={!total}
            onClick={() => replaceCurrent(editor.view, replacement)}
          >
            {M.replace}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            disabled={!total}
            onClick={() => replaceAll(editor.view, replacement)}
          >
            {M.replaceAll}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
