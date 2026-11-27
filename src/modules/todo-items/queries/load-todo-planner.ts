import { calendarEntries } from "../calendar";
import { plannerRepeats, plannerWindow, type PlannerBlock, type PlannerWindow } from "../planner";
import { listTodoCalendar } from "../repository/todo-recurrence";
import { listTodoItems } from "../repository/todo-items";
import { listTodoSchedule } from "../repository/todo-schedule";

export const UNPLACED_PAGE = 100;

/** A to-do not on the calendar yet, carrying what its block shows once it is dragged on. */
export type UnplacedTodo = Omit<PlannerBlock, "start" | "end" | "occursAt">;

const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export interface TodoPlannerData {
  window: PlannerWindow;
  today: string;
  entries: PlannerBlock[];
  unplaced: UnplacedTodo[];
  search: string;
}

/** The three days `?days=` asks for, and the newest to-dos not yet on the calendar. */
export async function loadTodoPlanner(
  scope: {
    days: string | undefined;
    projectId: number | null;
    withoutProject?: boolean;
    search?: string;
  },
  actorUserId: number,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<TodoPlannerData> {
  const window = plannerWindow(scope.days, today);
  const [scheduled, page, calendar] = await Promise.all([
    listTodoSchedule({ from: window.from, to: window.to, projectId: scope.projectId }, actorUserId),
    listTodoItems(
      { q: scope.search?.trim() || undefined, sort: "TodoItemId", dir: "desc", page: 1 },
      actorUserId,
      scope.projectId,
      UNPLACED_PAGE,
      {
        withoutProject: scope.withoutProject,
        unscheduled: true,
      },
    ),
    listTodoCalendar({ projectId: scope.projectId, from: window.from, to: window.to }, actorUserId),
  ]);
  const repeats = plannerRepeats(
    calendarEntries(calendar.todos, calendar.occurrences, window, today).entries,
  );
  const all: PlannerBlock[] = [...scheduled, ...repeats];
  const entries = scope.withoutProject ? all.filter((entry) => entry.projectId === null) : all;
  const unplaced = page.map((row) => ({
    todoItemId: row.TodoItemId,
    projectId: row.ProjectId,
    projectName: row.ProjectName,
    title: row.TodoItem ?? "",
    startDate: dayOf(row.StartDate),
    dueDate: dayOf(row.DueDate),
    priority: row.Priority,
    status: row.Status,
    assignee: row.Assignee,
    rowVer: row.RowVer,
    actorAccess: row.ActorAccess,
  }));
  return { window, today, entries, unplaced, search: scope.search?.trim() ?? "" };
}
