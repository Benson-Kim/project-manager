import { plannerWindow, type PlannerWindow } from "../planner";
import { listTodoItems } from "../repository/todo-items";
import { listTodoSchedule } from "../repository/todo-schedule";
import type { PlannerEntry } from "../schemas/todo-schedule";

export const UNPLACED_PAGE = 100;

export interface UnplacedTodo {
  todoItemId: number;
  title: string;
  projectName: string | null;
  rowVer: number;
}

export interface TodoPlannerData {
  window: PlannerWindow;
  today: string;
  entries: PlannerEntry[];
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
  const [scheduled, page] = await Promise.all([
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
  ]);
  const entries = scope.withoutProject
    ? scheduled.filter((entry) => entry.projectId === null)
    : scheduled;
  const unplaced = page.map((row) => ({
    todoItemId: row.TodoItemId,
    title: row.TodoItem ?? "",
    projectName: row.ProjectName,
    rowVer: row.RowVer,
  }));
  return { window, today, entries, unplaced, search: scope.search?.trim() ?? "" };
}
