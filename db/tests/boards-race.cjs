// Race checks for the board procs (ADR-0038): concurrent calls must not overrun a column's
// work-in-progress limit, must not leave two cards sharing a rank or an ambiguous order, must not
// let a stale write through, and must not leave a live card in a deleted column or on a deleted
// board. Runs in the CI db-apply job after the seeds and locally:
// node db/tests/boards-race.cjs. Creates a throwaway project and boards as e2e-pm, so never point
// it at a real database.
//
// NOT COVERED YET, and why — each needs a proc that is not written:
//   * sprint start and complete races (10 starts across 2 sprints; 10 completes) — usp_BoardSprint_*
//     is slice B3.
//   * delete a sprint or phase while a card or sprint is assigned to it — same slice.
//   * overlapping packages, and link-while-packaging — usp_BoardCard_Package and
//     usp_Board_SetProject are slices B4/B5.
// The plan's race matrix lists all of them; these rows stay Open in docs/BOARDS-TRACKING.md rather
// than being quietly dropped.
//
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (a .env file fills what is missing).
try {
  require("fs")
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .forEach((l) => {
      const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
} catch {
  // No .env: the environment must carry the DB_* values (CI).
}
const sql = require("mssql");
const PM = 3;
let pool;
let failures = 0;
let passes = 0;
const ok = (c, l) => (c ? passes++ : (failures++, console.log("FAIL", l)));
async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}
const settle = (fns) => Promise.allSettled(fns.map((f) => f()));
const codes = (rs) => rs.map((r) => (r.status === "fulfilled" ? "ok" : r.reason.number));
const count = (list, value) => list.filter((c) => c === value).length;

/** The board read: [header, columns, phases, sprints, cards]. */
const board = (boardId) => exec("usp_Board_GetBoard", { BoardId: boardId, ActorUserId: PM, CardsPerList: 200 });

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost",
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    pool: { max: 30 },
  });
  const stamp = Date.now();

  const [[project]] = await exec("usp_Project_Create", {
    ProjectName: `boards-race-${stamp}`, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0,
    Requisition: 0, DO: 0, PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  const P = project.ProjectId;
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
    ]),
    ActorUserId: PM,
  });

  /** A board whose middle column has the given limit. */
  async function newBoard(name, limit) {
    const [[row]] = await exec("usp_Board_Create", {
      ProjectId: P, Name: `${name}-${stamp}`, Description: null,
      ColumnsJson: JSON.stringify([
        { name: "To do", category: "todo", wipLimit: null },
        { name: "Doing", category: "doing", wipLimit: limit },
        { name: "Done", category: "done", wipLimit: null },
      ]),
      ActorUserId: PM,
    });
    const [, columns] = await board(row.BoardId);
    return { board: row, columns };
  }
  const card = async (boardId, columnId, title) =>
    (await exec("usp_BoardCard_Create", {
      BoardId: boardId, BoardColumnId: columnId, BoardSprintId: null, Title: title,
      Notes: null, AssigneeUserId: null, DueDate: null, StoryPoints: null, Color: null,
      ActorUserId: PM,
    }))[0][0];

  // 1. 20 parallel creates into a column with limit 5 -> exactly 5 land, the rest get 50007.
  {
    const b = await newBoard("wip-create", 5);
    const doing = b.columns[1];
    const r = codes(await settle(Array.from({ length: 20 }, (_, i) => () =>
      card(b.board.BoardId, doing.BoardColumnId, `c${i}`))));
    const [, cols] = await board(b.board.BoardId);
    const live = cols.find((c) => c.BoardColumnId === doing.BoardColumnId).WipCount;
    ok(count(r, "ok") === 5 && live === 5 && count(r, 50007) === 15,
      `limit 5 holds under 20 creates: ${count(r, "ok")} ok, ${live} live, ${JSON.stringify(r)}`);
  }

  // 2. The last free slot: limit 5, 4 already there, 20 parallel moves in -> exactly 1 succeeds.
  {
    const b = await newBoard("wip-last-slot", 5);
    const [todo, doing] = b.columns;
    for (let i = 0; i < 4; i++) await card(b.board.BoardId, doing.BoardColumnId, `seed${i}`);
    const waiting = [];
    for (let i = 0; i < 20; i++) waiting.push(await card(b.board.BoardId, todo.BoardColumnId, `w${i}`));
    const r = codes(await settle(waiting.map((c) => () =>
      exec("usp_BoardCard_Move", {
        BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), ToColumnId: doing.BoardColumnId,
        ToSprintId: null, SprintSet: 0, BeforeCardId: null, ActorUserId: PM,
      }))));
    const [, cols] = await board(b.board.BoardId);
    const live = cols.find((c) => c.BoardColumnId === doing.BoardColumnId).WipCount;
    ok(count(r, "ok") === 1 && live === 5 && count(r, 50007) === 19,
      `the last free slot goes to exactly one: ${count(r, "ok")} ok, ${live} live, ${JSON.stringify(r)}`);
  }

  // 3. A column with no limit takes everything: the check must not refuse where there is no rule.
  {
    const b = await newBoard("wip-none", null);
    const doing = b.columns[1];
    const r = codes(await settle(Array.from({ length: 12 }, (_, i) => () =>
      card(b.board.BoardId, doing.BoardColumnId, `u${i}`))));
    ok(count(r, "ok") === 12, `an unlimited column takes all 12: ${JSON.stringify(r)}`);
  }

  // 4. Repeated inserts at one spot force a renumber: only success or 50002, never INTERNAL, and
  //    the board keeps one unambiguous order (no two cards share a rank).
  {
    const b = await newBoard("renumber", null);
    const todo = b.columns[0];
    const anchor = await card(b.board.BoardId, todo.BoardColumnId, "anchor");
    const movers = [];
    for (let i = 0; i < 25; i++) movers.push(await card(b.board.BoardId, todo.BoardColumnId, `m${i}`));
    // Everyone tries to land immediately before the same anchor, over and over.
    const r = codes(await settle(movers.map((c) => () =>
      exec("usp_BoardCard_Move", {
        BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), ToColumnId: todo.BoardColumnId,
        ToSprintId: null, SprintSet: 0, BeforeCardId: anchor.BoardCardId, ActorUserId: PM,
      }))));
    const unexpected = r.filter((c) => c !== "ok" && c !== 50002);
    const [, , , , cards] = await board(b.board.BoardId);
    const keys = cards.map((c) => Number(c.SortKey));
    ok(unexpected.length === 0,
      `a forced renumber never surfaces as INTERNAL: ${JSON.stringify(unexpected)}`);
    ok(new Set(keys).size === keys.length,
      `every card keeps its own rank: ${keys.length} cards, ${new Set(keys).size} ranks`);
  }

  // 5. An edit and a move of ONE card against the same RowVer: one wins, the other gets 50002.
  {
    const b = await newBoard("lost-update", null);
    const [todo, doing] = b.columns;
    const c = await card(b.board.BoardId, todo.BoardColumnId, "contested");
    const r = codes(await settle([
      () => exec("usp_BoardCard_Update", {
        BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), Title: "renamed", Notes: null,
        AssigneeUserId: null, DueDate: null, StoryPoints: null, Color: null, ActorUserId: PM,
      }),
      () => exec("usp_BoardCard_Move", {
        BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), ToColumnId: doing.BoardColumnId,
        ToSprintId: null, SprintSet: 0, BeforeCardId: null, ActorUserId: PM,
      }),
    ]));
    ok(count(r, "ok") === 1 && count(r, 50002) === 1,
      `one of an edit and a move wins, the other conflicts: ${JSON.stringify(r)}`);
  }

  // 6. Delete a column while cards move into it: no live card may point at a deleted column.
  {
    const b = await newBoard("delete-vs-move", null);
    const [todo, doing, done] = b.columns;
    const movers = [];
    for (let i = 0; i < 8; i++) movers.push(await card(b.board.BoardId, todo.BoardColumnId, `d${i}`));
    const [[fresh]] = await exec("usp_Board_GetBoard", { BoardId: b.board.BoardId, ActorUserId: PM });
    const [, cols] = await board(b.board.BoardId);
    const target = cols.find((c) => c.BoardColumnId === doing.BoardColumnId);
    const kill = () => exec("usp_BoardColumn_Delete", {
      BoardColumnId: doing.BoardColumnId, RowVer: Number(target.RowVer),
      TargetColumnId: done.BoardColumnId, ActorUserId: PM,
    });
    const moves = movers.map((c) => () => exec("usp_BoardCard_Move", {
      BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), ToColumnId: doing.BoardColumnId,
      ToSprintId: null, SprintSet: 0, BeforeCardId: null, ActorUserId: PM,
    }));
    await settle([...moves.slice(0, 4), kill, ...moves.slice(4)]);
    const [, after, , , cards] = await board(b.board.BoardId);
    const liveColumns = new Set(after.map((c) => c.BoardColumnId));
    const orphans = cards.filter((c) => !liveColumns.has(c.BoardColumnId));
    ok(orphans.length === 0 && !liveColumns.has(doing.BoardColumnId) && fresh.BoardId === b.board.BoardId,
      `no live card sits in a deleted column (${orphans.length} orphans)`);
  }

  // 7. Delete the board while cards are written: nothing lands after the delete commits.
  {
    const b = await newBoard("delete-board", null);
    const todo = b.columns[0];
    const [[header]] = await board(b.board.BoardId);
    const writes = Array.from({ length: 10 }, (_, i) => () =>
      card(b.board.BoardId, todo.BoardColumnId, `late${i}`));
    const kill = () => exec("usp_Board_Delete", {
      BoardId: b.board.BoardId, RowVer: Number(header.RowVer), ActorUserId: PM,
    });
    const r = await settle([...writes.slice(0, 3), kill, ...writes.slice(3)]);
    const killed = r[3].status === "fulfilled";
    let reachable = true;
    try {
      await board(b.board.BoardId);
    } catch (e) {
      reachable = e.number !== 50001;
    }
    ok(killed && !reachable, `a deleted board stops taking and showing work (killed=${killed})`);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
