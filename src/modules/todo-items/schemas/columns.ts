import { columnSchemaFor } from "@/lib/custom-columns/register";
import { messages } from "@/lib/messages";

const M = messages.todoItems;

/** The project to-do list's built-in columns: stable key and default name. One list for the view and the procs. */
export const TODO_ITEM_BUILT_IN_COLUMNS = [
  { key: "TodoItem", name: M.todoItem },
  { key: "Calendar", name: M.planner.marker },
  { key: "Status", name: M.status },
  { key: "Assignee", name: M.assignee },
  { key: "Priority", name: M.priority },
  { key: "DueDate", name: M.dueDate },
  { key: "StartDate", name: M.startDate },
  { key: "ProjectOrActivity", name: M.projectOrActivity },
] as const;

export const todoItemColumnSchema = columnSchemaFor("TodoItem");
