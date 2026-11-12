"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import {
  EMPTY_HISTORY,
  nextStep,
  recordStep,
  settleStep,
  type Direction,
  type History,
  type StepOutcome,
  type UndoStep,
} from "@/lib/undo/history";
import { VersionBook } from "@/lib/undo/steps";
import { historyShortcut } from "./shortcut";

/** Pages whose history is kept while the user moves between them; the oldest goes first. */
const MAX_PAGES = 20;

export interface PageHistory {
  /** Records a change this page made; it empties Redo. */
  record: (step: UndoStep) => void;
  /** The versions this user's own saves returned, shared by every page. */
  book: VersionBook;
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
  run: (direction: Direction) => Promise<void>;
}

const PageHistoryContext = createContext<PageHistory | null>(null);

/** The page's history; outside the app shell (tests, sign-in) a recorder that keeps nothing. */
export function usePageHistory(): PageHistory {
  return useContext(PageHistoryContext) ?? NO_HISTORY;
}

const NO_HISTORY: PageHistory = {
  record: () => {},
  book: new VersionBook(),
  undoLabel: null,
  redoLabel: null,
  busy: false,
  run: async () => {},
};

/**
 * One undo history per page (ADR-0063), keyed by the path, which carries the project. It lives in
 * this window only. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z take a step unless a text box, a rich-text
 * editor or an editor with its own history already took the keys.
 */
export function PageHistoryProvider({ children }: { children: ReactNode }) {
  const page = usePathname() ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [pages, setPages] = useState<ReadonlyMap<string, History>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [book] = useState(() => new VersionBook());

  const update = useCallback((key: string, change: (history: History) => History) => {
    setPages((current) => {
      const next = new Map(current);
      next.delete(key);
      next.set(key, change(current.get(key) ?? EMPTY_HISTORY));
      while (next.size > MAX_PAGES) next.delete(next.keys().next().value!);
      return next;
    });
  }, []);

  const history = pages.get(page) ?? EMPTY_HISTORY;

  const record = useCallback(
    (step: UndoStep) => update(page, (current) => recordStep(current, step)),
    [page, update],
  );

  const run = useCallback(
    async (direction: Direction) => {
      const step = nextStep(history, direction);
      if (!step || running.current) return;
      running.current = true;
      setBusy(true);
      let outcome: StepOutcome;
      try {
        outcome = await step[direction]();
      } catch {
        outcome = "failed";
      }
      update(page, (current) => settleStep(current, direction, step, outcome));
      running.current = false;
      setBusy(false);
      if (outcome === "done") {
        const said =
          direction === "undo" ? messages.pageHistory.undone : messages.pageHistory.redone;
        announce(said(step.label));
        router.refresh();
      } else {
        const title =
          outcome === "stale" ? messages.pageHistory.stale : messages.pageHistory.failed;
        toast({ variant: outcome === "stale" ? "warning" : "error", title });
        if (outcome === "stale") router.refresh();
      }
    },
    [announce, history, page, router, toast, update],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = historyShortcut(event);
      if (!direction) return;
      event.preventDefault();
      void run(direction);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [run]);

  const value = useMemo<PageHistory>(
    () => ({
      record,
      book,
      undoLabel: nextStep(history, "undo")?.label ?? null,
      redoLabel: nextStep(history, "redo")?.label ?? null,
      busy,
      run,
    }),
    [record, book, history, busy, run],
  );

  return <PageHistoryContext.Provider value={value}>{children}</PageHistoryContext.Provider>;
}
