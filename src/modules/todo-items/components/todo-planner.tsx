"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Toolbar } from "@/components/ui/toolbar";
import { notifySaved } from "@/lib/cross-window";
import { messages } from "@/lib/messages";
import {
  createPlannerEntryAction,
  deleteTodoItemAction,
  scheduleTodoItemAction,
  unscheduleTodoItemAction,
} from "../actions";
import {
  DAY_MINUTES,
  HOUR_PX,
  OPEN_AT_MINUTES,
  SLOT_MINUTES,
  fromMinutes,
  layoutDay,
  minutesToPx,
  moveSlot,
  pxToMinutes,
  resizeSlot,
  shiftWindow,
  slotTimes,
  toMinutes,
  typedSlot,
  type Slot,
} from "../planner";
import type { TodoPlannerData } from "../queries/load-todo-planner";
import type { PlannerEntry } from "../schemas/todo-schedule";
import { CalendarModeSwitch } from "./calendar-mode-switch";
import { CalendarSwitch } from "./todo-calendar";

const P = messages.todoItems.planner;
const DRAG_TYPE = "application/x-planner-todo";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);
const QUARTERS = Array.from({ length: DAY_MINUTES / SLOT_MINUTES }, (_, i) => i);
const navButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line px-3 text-sm text-ink hover:bg-surface-raised disabled:opacity-50";
const accentButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-accent/40 bg-accent-soft px-3 text-sm font-medium text-accent disabled:opacity-50";
const field = "min-h-11 rounded-md border border-line bg-surface px-2 text-sm text-ink";
const labelClass = "flex flex-col gap-1 text-xs text-ink-muted";
const columnsClass = "grid grid-cols-[3.5rem_repeat(3,minmax(0,1fr))]";

type Outcome = { ok: true } | { ok: false; error: { code: string; message: string } };

interface Draft {
  day: string;
  start: string;
  end: string;
}

interface Gesture {
  entry: PlannerEntry;
  mode: "move" | "resize";
  x: number;
  y: number;
  moved: boolean;
}

function hhmm(day: string, minutes: number): string {
  return fromMinutes(day, minutes).slice(11, 16);
}

function draftAt(day: string, minutes: number): Draft {
  return { day, start: hhmm(day, minutes), end: hhmm(day, Math.min(minutes + 60, DAY_MINUTES)) };
}

function draftOf(slot: Slot): Draft {
  return {
    day: slot.start.slice(0, 10),
    start: slot.start.slice(11, 16),
    end: slot.end.slice(11, 16),
  };
}

function readDraft(draft: Draft): { slot: Slot } | { problem: string } {
  if (!TIME.test(draft.start) || !TIME.test(draft.end)) return { problem: P.timeFormat };
  const slot = typedSlot(draft.day, draft.start, draft.end);
  return slot.problem ? { problem: P[slot.problem] } : { slot };
}

function minuteAt(clientY: number, column: HTMLElement): number {
  const minutes = pxToMinutes(clientY - column.getBoundingClientRect().top);
  const slot = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  return Math.min(Math.max(slot, 0), DAY_MINUTES - SLOT_MINUTES);
}

function SlotFields({
  days,
  draft,
  onChange,
}: {
  days: string[];
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const dayId = useId();
  const time = (key: "start" | "end") => (
    <label className={labelClass}>
      {P[key]}
      <input
        className={`${field} w-20 tabular-nums`}
        value={draft[key]}
        inputMode="numeric"
        maxLength={5}
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        title={P.timeFormat}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <div className={labelClass}>
        <label htmlFor={dayId}>{P.day}</label>
        <select
          id={dayId}
          className={field}
          value={draft.day}
          onChange={(e) => onChange({ ...draft, day: e.target.value })}
        >
          {days.includes(draft.day) ? null : <option value={draft.day}>{draft.day}</option>}
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>
      {time("start")}
      {time("end")}
    </>
  );
}

export function TodoPlanner({
  data,
  projectId,
  canAdd = false,
  switchable = true,
  filter,
}: {
  data: TodoPlannerData;
  projectId: number | null;
  canAdd?: boolean;
  switchable?: boolean;
  filter?: ReactNode;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { days } = data.window;
  const firstDay = days.includes(data.today) ? data.today : days[0];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState<(Draft & { title: string }) | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [placeId, setPlaceId] = useState("");
  const [placeDraft, setPlaceDraft] = useState<Draft>(() => draftAt(firstDay, 9 * 60));
  const [saved, setSaved] = useState<Record<number, Slot & { until?: number }>>({});
  const [preview, setPreview] = useState<{ id: number; slot: Slot } | null>(null);
  const versions = useRef(new Map<number, number>());
  const saving = useRef(new Map<number, Promise<unknown>>());
  const gesture = useRef<Gesture | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = minutesToPx(OPEN_AT_MINUTES);
  }, []);

  const shown = data.entries.map((entry) => {
    if (preview?.id === entry.todoItemId) return { ...entry, ...preview.slot };
    const slot = saved[entry.todoItemId];
    return slot && (slot.until === undefined || entry.rowVer < slot.until)
      ? { ...entry, start: slot.start, end: slot.end }
      : entry;
  });
  const selected = shown.find((entry) => entry.todoItemId === selectedId) ?? null;

  function run(work: () => Promise<Outcome>, undo?: () => void, done?: () => void) {
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setError(null);
        done?.();
        notifySaved();
        router.refresh();
        return;
      }
      undo?.();
      setError(result.error.message);
      if (result.error.code === "CONFLICT" || result.error.code === "VALIDATION") router.refresh();
    });
  }

  function latest(todoItemId: number, rowVer: number) {
    return Math.max(rowVer, versions.current.get(todoItemId) ?? 0);
  }

  function schedule(todoItemId: number, rowVer: number, slot: Slot, done?: () => void) {
    const mark: Slot & { until?: number } = { ...slot };
    setSaved((all) => ({ ...all, [todoItemId]: mark }));
    const save = (saving.current.get(todoItemId) ?? Promise.resolve()).then(async () => {
      const result = await scheduleTodoItemAction({
        todoItemId,
        rowVer: latest(todoItemId, rowVer),
        start: slot.start,
        end: slot.end,
      });
      if (result.ok) {
        versions.current.set(todoItemId, result.data.rowVer);
        setSaved((all) =>
          all[todoItemId] === mark
            ? { ...all, [todoItemId]: { ...mark, until: result.data.rowVer } }
            : all,
        );
      }
      return result;
    });
    saving.current.set(
      todoItemId,
      save.catch(() => undefined),
    );
    run(
      () => save,
      () =>
        setSaved((all) => {
          if (all[todoItemId] !== mark) return all;
          const next = { ...all };
          delete next[todoItemId];
          return next;
        }),
      done,
    );
  }

  function select(entry: PlannerEntry) {
    setNewEntry(null);
    setSelectedId(entry.todoItemId);
    setSelectedDraft(draftOf(entry));
  }

  function dayAt(x: number, fallback: string): string {
    const index = columns.current.findIndex((column) => {
      const rect = column?.getBoundingClientRect();
      return rect ? x >= rect.left && x < rect.right : false;
    });
    return index === -1 ? fallback : days[index];
  }

  function gestureSlot(g: Gesture, e: PointerEvent): Slot {
    const day = g.entry.start.slice(0, 10);
    const delta = pxToMinutes(e.clientY - g.y);
    return g.mode === "resize"
      ? resizeSlot(g.entry, toMinutes(g.entry.end, day) + delta)
      : moveSlot(g.entry, dayAt(e.clientX, day), toMinutes(g.entry.start, day) + delta);
  }

  function onPointerDown(e: PointerEvent<HTMLElement>, entry: PlannerEntry, mode: Gesture["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { entry, mode, x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.abs(e.clientX - g.x) < 4 && Math.abs(e.clientY - g.y) < 4) return;
    g.moved = true;
    setPreview({ id: g.entry.todoItemId, slot: gestureSlot(g, e) });
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (!g) return;
    if (!g.moved) {
      select(g.entry);
      return;
    }
    const slot = gestureSlot(g, e);
    if (slot.start !== g.entry.start || slot.end !== g.entry.end) {
      schedule(g.entry.todoItemId, g.entry.rowVer, slot);
    }
  }

  function cancelGesture() {
    gesture.current = null;
    setPreview(null);
  }

  function onColumnClick(e: MouseEvent<HTMLDivElement>, day: string) {
    if (!canAdd || e.target !== e.currentTarget) return;
    setSelectedId(null);
    setNewEntry({ ...draftAt(day, minuteAt(e.clientY, e.currentTarget)), title: "" });
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: DragEvent<HTMLDivElement>, day: string) {
    const id = Number(e.dataTransfer.getData(DRAG_TYPE));
    const todo = data.unplaced.find((item) => item.todoItemId === id);
    if (!todo) return;
    e.preventDefault();
    const start = minuteAt(e.clientY, e.currentTarget);
    schedule(todo.todoItemId, todo.rowVer, {
      start: fromMinutes(day, start),
      end: fromMinutes(day, Math.min(start + 60, DAY_MINUTES)),
    });
  }

  function saveNewEntry() {
    if (!newEntry) return;
    const read = readDraft(newEntry);
    if ("problem" in read) {
      setError(read.problem);
      return;
    }
    if (!newEntry.title.trim()) {
      setError(P.titleRequired);
      return;
    }
    const input = { title: newEntry.title, projectId, start: read.slot.start, end: read.slot.end };
    run(
      () => createPlannerEntryAction(input),
      undefined,
      () => setNewEntry(null),
    );
  }

  function saveSelected() {
    if (!selected || !selectedDraft) return;
    const read = readDraft(selectedDraft);
    if ("problem" in read) {
      setError(read.problem);
      return;
    }
    schedule(selected.todoItemId, selected.rowVer, read.slot);
  }

  function place() {
    const todo = data.unplaced.find((item) => String(item.todoItemId) === placeId);
    if (!todo) return;
    const read = readDraft(placeDraft);
    if ("problem" in read) {
      setError(read.problem);
      return;
    }
    schedule(todo.todoItemId, todo.rowVer, read.slot, () => setPlaceId(""));
  }

  function unschedule() {
    if (!selected) return;
    const input = {
      todoItemId: selected.todoItemId,
      rowVer: latest(selected.todoItemId, selected.rowVer),
    };
    run(
      () => unscheduleTodoItemAction(input),
      undefined,
      () => setSelectedId(null),
    );
  }

  function remove() {
    if (!selected) return;
    const input = {
      todoItemId: selected.todoItemId,
      rowVer: latest(selected.todoItemId, selected.rowVer),
    };
    run(
      () => deleteTodoItemAction(input),
      undefined,
      () => {
        setConfirmDelete(false);
        setSelectedId(null);
      },
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="todo-planner">
      <Toolbar>
        {filter}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navButton}
            aria-label={P.previous}
            data-testid="planner-previous"
            onClick={() => update({ days: shiftWindow(data.window.from, -1) })}
          >
            ‹
          </button>
          <span
            aria-live="polite"
            data-testid="planner-range"
            className="min-w-20 text-center text-sm font-semibold tabular-nums text-ink"
          >
            {data.window.from} – {data.window.to}
          </span>
          <button
            type="button"
            className={navButton}
            aria-label={P.next}
            data-testid="planner-next"
            onClick={() => update({ days: shiftWindow(data.window.from, 1) })}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className={navButton}
          data-testid="planner-today"
          onClick={() => update({ days: null })}
        >
          {P.today}
        </button>
        <CalendarModeSwitch mode="planner" />
        {switchable ? <CalendarSwitch on /> : null}
        {canAdd ? (
          <button
            type="button"
            className={accentButton}
            data-testid="planner-new-entry"
            onClick={() => {
              setSelectedId(null);
              setNewEntry({ ...draftAt(firstDay, 9 * 60), title: "" });
            }}
          >
            {P.newEntry}
          </button>
        ) : null}
        <button
          type="button"
          className={navButton}
          aria-expanded={panelOpen}
          aria-controls="planner-todos"
          data-testid="planner-toggle-todos"
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? P.hideTodos : P.showTodos}
        </button>
      </Toolbar>

      {error ? (
        <p role="alert" data-testid="planner-error" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {newEntry ? (
        <form
          data-testid="planner-entry-form"
          className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveNewEntry();
          }}
        >
          <label className={`${labelClass} min-w-48 flex-1`}>
            {P.title}
            <input
              className={field}
              value={newEntry.title}
              maxLength={255}
              onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
            />
          </label>
          <SlotFields
            days={days}
            draft={newEntry}
            onChange={(d) => setNewEntry({ ...newEntry, ...d })}
          />
          <button type="submit" className={accentButton} disabled={pending}>
            {P.save}
          </button>
          <button type="button" className={navButton} onClick={() => setNewEntry(null)}>
            {P.cancel}
          </button>
        </form>
      ) : null}

      {selected && selectedDraft ? (
        <form
          data-testid="planner-selected"
          className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveSelected();
          }}
        >
          <p className="w-full truncate text-sm font-medium text-ink">{selected.title}</p>
          <SlotFields days={days} draft={selectedDraft} onChange={setSelectedDraft} />
          <button type="submit" className={accentButton} disabled={pending}>
            {P.save}
          </button>
          <button
            type="button"
            className={navButton}
            onClick={() => update({ id: String(selected.todoItemId) })}
          >
            {P.open}
          </button>
          <button type="button" className={navButton} disabled={pending} onClick={unschedule}>
            {P.unschedule}
          </button>
          <button
            type="button"
            className={navButton}
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </button>
          <button type="button" className={navButton} onClick={() => setSelectedId(null)}>
            {P.cancel}
          </button>
        </form>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-md border border-line">
          <div className="min-w-[36rem]">
            <div className={`${columnsClass} border-b border-line`}>
              <span />
              {days.map((day) => (
                <div
                  key={day}
                  aria-current={day === data.today ? "date" : undefined}
                  className={`border-l border-line px-2 py-2 text-center text-sm font-semibold tabular-nums ${
                    day === data.today ? "text-accent" : "text-ink"
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            <div
              ref={scroller}
              role="region"
              aria-label={P.name}
              tabIndex={0}
              data-testid="planner-scroll"
              className="h-[32rem] overflow-y-auto"
            >
              <div className={columnsClass} style={{ height: minutesToPx(DAY_MINUTES) }}>
                <div className="relative">
                  {HOURS.map((hour) => (
                    <span
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-ink-muted"
                      style={{ top: hour * HOUR_PX }}
                    >
                      {`${String(hour).padStart(2, "0")}:00`}
                    </span>
                  ))}
                </div>
                {days.map((day, index) => (
                  <div
                    key={day}
                    ref={(column) => {
                      columns.current[index] = column;
                    }}
                    data-testid={`planner-day-${day}`}
                    className={`relative border-l border-line ${canAdd ? "cursor-cell" : ""}`}
                    onClick={(e) => onColumnClick(e, day)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, day)}
                  >
                    {QUARTERS.map((quarter) => (
                      <div
                        key={quarter}
                        aria-hidden
                        className={`pointer-events-none absolute inset-x-0 border-t ${
                          quarter % 4 === 0 ? "border-line" : "border-dashed border-line/40"
                        }`}
                        style={{ top: (quarter * HOUR_PX) / 4 }}
                      />
                    ))}
                    {layoutDay(shown, day).map(({ entry, top, bottom, column, columns: count }) => (
                      <div
                        key={entry.todoItemId}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedId === entry.todoItemId}
                        aria-label={`${entry.title} ${slotTimes(entry)}`}
                        data-testid="planner-entry"
                        data-todo-id={entry.todoItemId}
                        className={`absolute cursor-grab touch-none select-none overflow-hidden rounded-md border bg-accent-soft px-1.5 py-0.5 text-xs text-accent ${
                          selectedId === entry.todoItemId
                            ? "border-accent ring-2 ring-accent"
                            : "border-accent/40"
                        }`}
                        style={{
                          top: minutesToPx(top),
                          height: Math.max(minutesToPx(bottom - top), 16),
                          left: `calc(${(column / count) * 100}% + 2px)`,
                          width: `calc(${100 / count}% - 4px)`,
                        }}
                        onPointerDown={(e) => onPointerDown(e, entry, "move")}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={cancelGesture}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          select(entry);
                        }}
                      >
                        <span className="block truncate font-medium">{entry.title}</span>
                        <span className="block tabular-nums">{slotTimes(entry)}</span>
                        <span
                          aria-hidden
                          title={P.resize}
                          data-testid="planner-entry-resize"
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                          onPointerDown={(e) => onPointerDown(e, entry, "resize")}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {panelOpen ? (
          <aside
            id="planner-todos"
            data-testid="planner-todos"
            className="flex w-full flex-col gap-2 rounded-md border border-line p-3 lg:w-72"
          >
            <h2 className="text-sm font-semibold text-ink">{P.todos}</h2>
            {data.unplaced.length === 0 ? (
              <p className="text-sm text-ink-muted">{P.noTodos}</p>
            ) : (
              <>
                <p className="text-xs text-ink-muted">{P.dragHint}</p>
                <ul
                  aria-label={P.todos}
                  tabIndex={0}
                  className="flex max-h-64 flex-col gap-1 overflow-y-auto"
                >
                  {data.unplaced.map((todo) => (
                    <li
                      key={todo.todoItemId}
                      draggable
                      data-testid="planner-todo"
                      className="cursor-grab rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_TYPE, String(todo.todoItemId));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <span className="block truncate">{todo.title}</span>
                      {todo.projectName ? (
                        <span className="block truncate text-xs text-ink-muted">
                          {todo.projectName}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <form
                  data-testid="planner-place"
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    place();
                  }}
                >
                  <label className={`${labelClass} w-full`}>
                    {P.todos}
                    <select
                      className={field}
                      value={placeId}
                      onChange={(e) => setPlaceId(e.target.value)}
                    >
                      <option value="" />
                      {data.unplaced.map((todo) => (
                        <option key={todo.todoItemId} value={todo.todoItemId}>
                          {todo.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SlotFields days={days} draft={placeDraft} onChange={setPlaceDraft} />
                  <button type="submit" className={accentButton} disabled={pending || !placeId}>
                    {P.schedule}
                  </button>
                </form>
              </>
            )}
          </aside>
        ) : null}
      </div>

      {selected ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(
            messages.todoItems.entity,
            selected.title || messages.app.untitled,
          )}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={remove}
          pending={pending}
        />
      ) : null}
    </div>
  );
}
