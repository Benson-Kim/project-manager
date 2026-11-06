import {
  calendarEntries,
  calendarMonth,
  monthGrid,
  type CalendarEntry,
  type MonthGrid,
} from "../calendar";
import { listTodoCalendar } from "../repository/todo-recurrence";

export interface TodoCalendarData {
  month: string;
  grid: MonthGrid;
  today: string;
  entries: CalendarEntry[];
  cut: number;
}

/** The calendar month `?month=` asks for (else today's), read for one project, or all the actor can see. */
export async function loadTodoCalendar(
  scope: { month: string | undefined; projectId: number | null; withoutProject?: boolean },
  actorUserId: number,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<TodoCalendarData> {
  const month = calendarMonth(scope.month, today);
  const grid = monthGrid(month);
  const { todos, occurrences } = await listTodoCalendar(
    { projectId: scope.projectId, ...grid.window },
    actorUserId,
  );
  const shown = scope.withoutProject ? todos.filter((todo) => todo.projectId === null) : todos;
  const { entries, cut } = calendarEntries(shown, occurrences, grid.window, today);
  return { month, grid, today, entries, cut };
}
