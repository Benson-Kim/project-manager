import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moveKey, normalizeLayout, orderColumns, parseListLayout } from "@/lib/list-layout";

/**
 * Guardrail: arranging the columns of a to-do or daily-activity list, and still
 * finding that arrangement on the next load (client feedback, reported more
 * than once).
 *
 * The reorder path reads as correct, which is exactly the problem — nothing
 * went red when it was reported again, because no test covered a column
 * reorder on any module. A browser is what proves the gesture, and none runs in
 * this workspace, so e2e/datasheet.spec.ts holds the drag and the dialog and
 * what is held here is everything a reorder depends on that is reachable
 * without a browser: the layout a reorder stores, through the trip to the
 * database and back onto both of a module's pages, and the construction the
 * gesture is built from.
 *
 * The two modules are not the same shape. Daily activities always shows the
 * Project column; to-dos show it on /todo only, so a to-do arrangement stored
 * on one page is read back on a page whose column set differs.
 */
const CELLS = "src/components/ui/data-view/datasheet-cells.tsx";
const VIEW = "src/components/ui/data-view/data-view.tsx";
const DIALOG = "src/components/ui/data-view/table-layout-dialog.tsx";
const TODO_VIEW = "src/modules/todo-items/components/todo-view.tsx";
const ACTIVITIES_VIEW = "src/modules/daily-activities/components/daily-activities-view.tsx";
const LAYOUT_MIGRATION = "db/migrations/019_view_preference_layout.sql";

const source = (path: string) => readFileSync(path, "utf8");

/** The th element of the header row, which owns the drag. */
function headerElement(): string {
  const text = source(CELLS);
  const start = text.indexOf("export function HeaderCell");
  expect(start, `${CELLS}: export function HeaderCell`).toBeGreaterThan(-1);
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end);
}

/**
 * The column keys a module's buildColumns declares, in default display order.
 * Read from the module rather than retyped, so a renamed or added column is
 * exercised here instead of drifting away from what the page renders.
 */
function defaultKeys(path: string): string[] {
  const text = source(path);
  const start = text.indexOf("function buildColumns");
  expect(start, `${path}: function buildColumns`).toBeGreaterThan(-1);
  const body = text.slice(start, text.indexOf("\n}\n", start));
  expect(body, `${path}: buildColumns calls projectColumn`).toContain("projectColumn");
  const keys = [...body.matchAll(/key: "([A-Za-z0-9_-]+)"/g)].map((match) => match[1]!);
  expect(keys.length, `${path}: column keys`).toBeGreaterThan(1);
  // projectColumn supplies its own key, so it is not among the matches above.
  return ["Project", ...keys];
}

const columnsOf = (keys: readonly string[]) => keys.map((key) => ({ key }));
const keysOf = (columns: readonly { key: string }[]) => columns.map((column) => column.key);

/** What a page stores after the user moves one column, as the DataView would. */
function reorder(pageKeys: readonly string[], from: number, to: number) {
  return normalizeLayout(pageKeys, { order: moveKey(pageKeys, from, to) });
}

/** The stored layout as the page receives it again: JSON text through the proc. */
const reread = (layout: unknown) => parseListLayout(JSON.stringify(layout));

describe("the arrangement a reorder stores comes back on every page of its module", () => {
  const activities = defaultKeys(ACTIVITIES_VIEW);
  // To-dos: /todo offers the Project column, a project's own page does not.
  const todoAllProjects = defaultKeys(TODO_VIEW);
  const todoOneProject = todoAllProjects.filter((key) => key !== "Project");

  it("keeps a daily-activity arrangement: the Project column is on both pages", () => {
    expect(activities[0]).toBe("Project");
    const moved = reorder(activities, activities.indexOf("Comments"), 0);
    expect(moved?.order?.[0]).toBe("Comments");
    expect(keysOf(orderColumns(columnsOf(activities), reread(moved)?.order))).toEqual(moved!.order);
  });

  it("carries a to-do arrangement made on a project page over to /todo", () => {
    const moved = reorder(todoOneProject, todoOneProject.indexOf("Priority"), 0);
    // Nothing stored says where Project goes, so it keeps its default place:
    // first, as it is declared. The moved column keeps the place the user gave it.
    const shown = keysOf(orderColumns(columnsOf(todoAllProjects), reread(moved)?.order));
    expect(shown[0]).toBe("Project");
    expect(shown[1]).toBe("Priority");
    expect([...shown].sort()).toEqual([...todoAllProjects].sort());
  });

  it("carries a to-do arrangement made on /todo back to a project page, without a Project header", () => {
    const moved = reorder(todoAllProjects, todoAllProjects.indexOf("DueDate"), 1);
    const shown = keysOf(orderColumns(columnsOf(todoOneProject), reread(moved)?.order));
    expect(shown).not.toContain("Project");
    expect(shown[0]).toBe("DueDate");
    expect([...shown].sort()).toEqual([...todoOneProject].sort());
  });

  it("never normalizes a real reorder away to the module default", () => {
    // A layout normalized to null is stored as NULL and reads back as the
    // module's own order: the column springs back with nothing said.
    for (const page of [activities, todoAllProjects, todoOneProject]) {
      expect(reorder(page, page.length - 1, 0)).not.toBeNull();
      expect(reorder(page, 0, 1)).not.toBeNull();
    }
  });

  it("stores every key both modules use: none is rejected by the layout schema", () => {
    for (const page of [activities, todoAllProjects, todoOneProject]) {
      const stored = {
        order: moveKey(page, 0, 1),
        widths: Object.fromEntries(page.map((k) => [k, 200])),
      };
      expect(reread(stored)).toEqual(stored);
    }
  });

  it("fits an arranged and resized layout inside the Layout column", () => {
    const declared = /Layout NVARCHAR\((\d+)\)/.exec(source(LAYOUT_MIGRATION));
    expect(declared, `${LAYOUT_MIGRATION}: Layout NVARCHAR(n)`).not.toBeNull();
    const limit = Number(declared![1]);
    for (const page of [activities, todoAllProjects, todoOneProject]) {
      const stored = JSON.stringify({
        order: moveKey(page, 0, 1),
        widths: Object.fromEntries(page.map((key) => [key, 800])),
        rowHeight: 240,
      });
      // Truncation to the column's width leaves invalid JSON, which the proc's
      // ISJSON check rejects: the save is refused and the arrangement is lost.
      expect(stored.length, `${page.length} columns`).toBeLessThan(limit);
    }
  });
});

describe("a dragged header can actually be dropped", () => {
  it("lets go of the drop by preventing the default on dragover and on drop", () => {
    // A dragover that does not preventDefault leaves the th a non-drop target,
    // and the browser never fires drop: the column springs back, silently.
    const th = headerElement();
    const dragOver = th.slice(th.indexOf("onDragOver="), th.indexOf("onDrop="));
    const drop = th.slice(th.indexOf("onDrop="), th.indexOf("onDragEnd="));
    expect(dragOver).toContain("e.preventDefault()");
    expect(drop).toContain("e.preventDefault()");
  });

  it("starts the drag from the header itself and names the column it carries", () => {
    const th = headerElement();
    expect(th).toContain("draggable={drag ? true : undefined}");
    expect(th).toMatch(/onDragStart=[\s\S]*setData\("text\/plain", column\.key\)/);
    expect(th).toMatch(/onDragStart=[\s\S]*drag\.onStart\(\)/);
    expect(th).toContain("onDragEnd={drag?.onEnd}");
  });

  it("keeps a click and a resize from becoming a column drag", () => {
    // Both sit inside the draggable th; neither may drag on its own.
    const text = source(CELLS);
    const sortButton = text.slice(text.indexOf("data-testid={`sort-${testId}`}"));
    expect(sortButton.slice(0, sortButton.indexOf("onClick="))).toContain("draggable={false}");
    const handle = text.slice(text.indexOf('role="separator"'));
    expect(handle.slice(0, handle.indexOf("onPointerDown="))).toContain("draggable={false}");
  });

  it("wires every header to the drop of its own column", () => {
    const text = source(VIEW);
    const drag = text.slice(text.indexOf("drag={{"), text.indexOf("onEnd:"));
    for (const callback of ["onStart:", "onOver:", "onDrop:"]) {
      expect(drag, `data-view header drag ${callback}`).toContain(callback);
    }
    expect(drag).toContain("onDrop: () => dropColumn(col.key)");
  });

  it("moves the column within the list the headers were rendered from", () => {
    // Taking the indices from `columns` instead would move the wrong column
    // whenever the user had already arranged the table.
    const text = source(VIEW);
    const dropColumn = text.slice(text.indexOf("const dropColumn ="));
    const body = dropColumn.slice(0, dropColumn.indexOf("\n  };"));
    expect(body).toContain("shownColumns.map((column) => column.key)");
    expect(body).toContain("moveKey(keys, keys.indexOf(dragged), keys.indexOf(target))");
    expect(body).not.toMatch(/\bcolumns\.map\(/);
  });
});

describe("the dialog arranges the same columns the table shows", () => {
  it("opens on the current order, not the module default", () => {
    const text = source(VIEW);
    const dialog = text.slice(text.indexOf("<TableLayoutDialog"));
    const props = dialog.slice(0, dialog.indexOf("/>"));
    expect(props).toContain("columns={shownColumns}");
    expect(props).not.toContain("columns={columns}");
  });

  it("mounts the editor only while open, so it never reopens on a stale order", () => {
    // The keys are useState initialised from the columns prop: an editor left
    // mounted would keep the order from the first time it was opened.
    const text = source(DIALOG);
    expect(text).toContain("{open ? (");
    expect(text).toContain("useState(() => columns.map((column) => column.key))");
  });

  it("moves a column by one place and applies the keys on Save", () => {
    const text = source(DIALOG);
    expect(text).toContain("moveKey(current, index, index - 1)");
    expect(text).toContain("moveKey(current, index, index + 1)");
    expect(text).toContain("onApply({ order: keys, rowHeight: height })");
  });

  it("says so when the arrangement could not be stored", () => {
    // Both the refusal and the thrown failure: an arrangement that silently
    // fails to persist is what reads as "reordering does not work".
    const text = source(VIEW);
    const save = text.slice(text.indexOf("const saveLayout ="));
    const body = save.slice(0, save.indexOf("\n  };"));
    expect(body.match(/messages\.datasheet\.layoutNotSaved/g)).toHaveLength(2);
    expect(body).toContain(".catch(");
  });
});

describe("the arrangement is stored under the key every page of the module reads", () => {
  const pagesOf = (moduleKey: string, viewPath: string, pages: readonly string[]) => ({
    moduleKey,
    viewPath,
    pages,
  });
  const modules = [
    pagesOf("todo-items", TODO_VIEW, [
      "src/app/(app)/todo/page.tsx",
      "src/app/(app)/projects/[id]/todos/page.tsx",
    ]),
    pagesOf("daily-activities", ACTIVITIES_VIEW, [
      "src/app/(app)/daily-activities/page.tsx",
      "src/app/(app)/projects/[id]/daily-activities/page.tsx",
    ]),
  ];

  it.each(modules)("$moduleKey writes and reads one key, and hands the layout down", (module) => {
    // A key that differs between the write and the read stores the arrangement
    // where nothing looks for it, and every page opens on the default again.
    expect(source(module.viewPath)).toContain(`moduleKey="${module.moduleKey}"`);
    for (const page of module.pages) {
      const text = source(page);
      expect(text, `${page}: reads the layout`).toContain(
        `getListPreference(session.userId, "${module.moduleKey}")`,
      );
      expect(text, `${page}: passes it to the view`).toContain("layout={preference?.layout}");
    }
    expect(source(module.viewPath), `${module.viewPath}: initialLayout`).toContain(
      "initialLayout={layout}",
    );
  });
});
