// Behaviour checks for the board procs (ADR-0038): the board as its own access scope, the
// standalone shared space, per-person overrides on a project board and never on a standalone one,
// rowversion concurrency, the starting-columns payload validation, LIKE-metacharacter search, and
// what a board whose project was deleted does. Runs against the seeded database in the CI db-apply
// job (E2E_SEED=1: users 1 admin, 2 e2e-admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and
// locally: node db/tests/boards-procs.cjs. Users 1 AND 2 are both global Admins, who are Manager
// everywhere (ADR-0021), so neither can stand in for a user with no access; the outsider checks
// create their own user rather than naming a seeded id. Creates throwaway projects, boards and one
// user, and leaves soft-deleted rows behind, so never point it at a real database.
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

const ADMIN = 1;
const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

// The last call attempted, so an unexpected throw can name itself. Without this the script dies
// with a bare RequestError and no indication of which of its ~200 calls raised it, and the whole
// tally is lost with it — which is exactly what the first CI run of the B3 half did.
let lastCall = null;
async function exec(proc, params) {
  lastCall = { proc, params };
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const res = await req.execute(proc);
  return res.recordsets;
}
function ok(cond, label) {
  if (cond) passes++;
  else {
    failures++;
    console.log("FAIL", label);
  }
}
async function expectCode(code, label, fn) {
  try {
    await fn();
    ok(false, `${label}: expected ${code}, got success`);
  } catch (e) {
    ok(e.number === code, `${label}: expected ${code}, got ${e.number} ${e.message}`);
  }
}
async function project(name) {
  const [[row]] = await exec("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
const COLUMNS = JSON.stringify([
  { name: "To do", category: "todo", wipLimit: null },
  { name: "In progress", category: "doing", wipLimit: 3 },
  { name: "Done", category: "done", wipLimit: null },
]);
async function board(params) {
  const [[row]] = await exec("usp_Board_Create", {
    ProjectId: null, Description: null, ColumnsJson: COLUMNS, ...params,
  });
  return row;
}

async function main() {
  pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER || "localhost",
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "ProjectManager",
    options: { encrypt: true, trustServerCertificate: true },
  }).connect();

  // A user with no project assignment anywhere. No seeded id can play this part: 1 and 2 are both
  // Admins, and 3-5 are assigned to every project below. The role comes from a seeded 'User' so the
  // check does not hard-code a RoleId either.
  const [[pmUser]] = await exec("usp_User_GetById", { UserId: PM, ActorUserId: ADMIN });
  const [[created]] = await exec("usp_User_Create", {
    Username: `boards-outsider-${Date.now()}`,
    PasswordHash: "not-a-real-hash",
    DisplayName: "Boards outsider",
    Email: null,
    RoleId: pmUser.RoleId,
    MustChangePassword: 1,
    ActorUserId: ADMIN,
  });
  const OUTSIDER = created.UserId;

  const P = await project(`Boards test ${Date.now()}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // --- the starting columns are checked before any CHECK constraint can fire ----------------
  await expectCode(50004, "no columns", () =>
    board({ Name: "bad", ColumnsJson: "[]", ActorUserId: PM }));
  await expectCode(50004, "columns not an array", () =>
    board({ Name: "bad", ColumnsJson: '{"name":"x"}', ActorUserId: PM }));
  await expectCode(50004, "a column that is not an object", () =>
    board({ Name: "bad", ColumnsJson: "[1]", ActorUserId: PM }));
  await expectCode(50004, "unknown category", () =>
    board({ Name: "bad", ColumnsJson: JSON.stringify([{ name: "x", category: "archive", wipLimit: null }]), ActorUserId: PM }));
  await expectCode(50004, "wip limit out of range", () =>
    board({ Name: "bad", ColumnsJson: JSON.stringify([{ name: "x", category: "todo", wipLimit: 0 }]), ActorUserId: PM }));
  await expectCode(50004, "wip limit not a number", () =>
    board({ Name: "bad", ColumnsJson: JSON.stringify([{ name: "x", category: "todo", wipLimit: "lots" }]), ActorUserId: PM }));
  await expectCode(50004, "duplicate column names", () =>
    board({ Name: "bad", ColumnsJson: JSON.stringify([
      { name: "To do", category: "todo", wipLimit: null },
      { name: "To do", category: "done", wipLimit: null },
    ]), ActorUserId: PM }));
  await expectCode(50004, "too many columns", () =>
    board({ Name: "bad", ColumnsJson: JSON.stringify(
      Array.from({ length: 13 }, (_, i) => ({ name: `C${i}`, category: "todo", wipLimit: null })),
    ), ActorUserId: PM }));
  await expectCode(50004, "blank board name", () =>
    board({ Name: "   ", ActorUserId: PM }));

  // --- a project board follows its project's levels -----------------------------------------
  const pb = await board({ ProjectId: P, Name: "Delivery", ActorUserId: PM });
  ok(pb.BoardId > 0 && pb.ProjectId === P, "manager creates a project board");
  ok(pb.ActorAccess === "Manager", "creator of a project board holds their project level");

  const [[seen]] = await exec("usp_Board_GetById", { BoardId: pb.BoardId, ActorUserId: VIEWER });
  ok(seen.ActorAccess === "Viewer", "viewer reads a project board at their level");
  await expectCode(50003, "viewer updates a project board", () =>
    exec("usp_Board_Update", { BoardId: pb.BoardId, RowVer: pb.RowVer, Name: "x", Description: null, ActorUserId: VIEWER }));

  const [[upd]] = await exec("usp_Board_Update", {
    BoardId: pb.BoardId, RowVer: pb.RowVer, Name: "  Delivery board  ", Description: null, ActorUserId: CONTRIB,
  });
  ok(upd.Name === "Delivery board", "contributor renames a project board, name trimmed");
  await expectCode(50003, "contributor deletes a project board", () =>
    exec("usp_Board_Delete", { BoardId: pb.BoardId, RowVer: upd.RowVer, ActorUserId: CONTRIB }));
  await expectCode(50002, "stale row version", () =>
    exec("usp_Board_Update", { BoardId: pb.BoardId, RowVer: pb.RowVer, Name: "again", Description: null, ActorUserId: PM }));

  // A user with no level on the project cannot reach the board at all. The 50003-vs-50001
  // difference below is the inherited existence oracle (ADR-0012), deliberately left open:
  // it needs its own ADR and branch, so these checks record today's behaviour, not a target.
  await expectCode(50003, "outsider reads a project board", () =>
    exec("usp_Board_GetById", { BoardId: pb.BoardId, ActorUserId: OUTSIDER }));
  await expectCode(50001, "a board id that does not exist", () =>
    exec("usp_Board_GetById", { BoardId: 2147483600, ActorUserId: PM }));

  // --- per-person overrides reach a project board --------------------------------------------
  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: VIEWER,
    OverridesJson: JSON.stringify([{ module: "boards", verb: "update", allowed: true }]),
    ActorUserId: PM,
  });
  const [[granted]] = await exec("usp_Board_GetById", { BoardId: pb.BoardId, ActorUserId: VIEWER });
  ok((granted.ActorGrants || "").includes("update"), "the read reports the granted verb");
  const [[byViewer]] = await exec("usp_Board_Update", {
    BoardId: pb.BoardId, RowVer: granted.RowVer, Name: "Viewer renamed", Description: null, ActorUserId: VIEWER,
  });
  ok(byViewer.Name === "Viewer renamed", "a granted viewer renames the board");

  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: CONTRIB,
    OverridesJson: JSON.stringify([{ module: "boards", verb: "update", allowed: false }]),
    ActorUserId: PM,
  });
  await expectCode(50003, "a revoked contributor cannot rename", () =>
    exec("usp_Board_Update", { BoardId: pb.BoardId, RowVer: byViewer.RowVer, Name: "nope", Description: null, ActorUserId: CONTRIB }));

  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: CONTRIB,
    OverridesJson: JSON.stringify([{ module: "boards", verb: "delete", allowed: true }]),
    ActorUserId: PM,
  });
  const [[toDelete]] = await exec("usp_Board_GetById", { BoardId: pb.BoardId, ActorUserId: CONTRIB });
  await exec("usp_Board_Delete", { BoardId: toDelete.BoardId, RowVer: toDelete.RowVer, ActorUserId: CONTRIB });
  await expectCode(50001, "a deleted board is gone", () =>
    exec("usp_Board_GetById", { BoardId: pb.BoardId, ActorUserId: PM }));

  // Overrides belong to the project, not the deleted board. Restore the actors' base levels
  // before later checks use them as an ordinary Viewer and Contributor on this same project.
  for (const userId of [VIEWER, CONTRIB]) {
    await exec("usp_ProjectPermission_Set", {
      ProjectId: P, UserId: userId, OverridesJson: "[]", ActorUserId: PM,
    });
  }

  // --- the standalone shared space ------------------------------------------------------------
  const sb = await board({ Name: "Shared board", ActorUserId: CONTRIB });
  ok(sb.ProjectId === null && sb.ActorAccess === "Manager", "the creator of a standalone board is its manager");
  const [[byOther]] = await exec("usp_Board_GetById", { BoardId: sb.BoardId, ActorUserId: VIEWER });
  ok(byOther.ActorAccess === "Contributor", "every user is a contributor on a standalone board");
  ok(!byOther.ActorGrants && !byOther.ActorRevokes, "a standalone board carries no overrides");
  const [[sharedUpd]] = await exec("usp_Board_Update", {
    BoardId: sb.BoardId, RowVer: sb.RowVer, Name: "Shared, renamed", Description: null, ActorUserId: VIEWER,
  });
  ok(sharedUpd.Name === "Shared, renamed", "another user works a standalone board");
  await expectCode(50003, "a non-creator deletes a standalone board", () =>
    exec("usp_Board_Delete", { BoardId: sb.BoardId, RowVer: sharedUpd.RowVer, ActorUserId: VIEWER }));

  // An override of 'boards' cannot reach a standalone board: it has no project to hold one.
  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: VIEWER,
    OverridesJson: JSON.stringify([{ module: "boards", verb: "delete", allowed: true }]),
    ActorUserId: PM,
  });
  await expectCode(50003, "a project override never reaches a standalone board", () =>
    exec("usp_Board_Delete", { BoardId: sb.BoardId, RowVer: sharedUpd.RowVer, ActorUserId: VIEWER }));
  const [[adminRow]] = await exec("usp_Board_GetById", { BoardId: sb.BoardId, ActorUserId: ADMIN });
  ok(adminRow.ActorAccess === "Manager", "an admin is a manager on a standalone board");

  // --- search escapes the LIKE metacharacters ------------------------------------------------
  const searchStamp = Date.now();
  const oddName = `50% [draft] a_b ${searchStamp}`;
  const odd = await board({ Name: oddName, ActorUserId: PM });
  await board({ Name: `50 percent plain ${searchStamp}`, ActorUserId: PM });
  const [found] = await exec("usp_Board_List", { ActorUserId: PM, Search: oddName, WithoutProject: true });
  ok(found.length === 1 && found[0].BoardId === odd.BoardId, "a search for wildcards matches the one literal name");
  const [underscore] = await exec("usp_Board_List", { ActorUserId: PM, Search: "a_b", WithoutProject: true });
  ok(underscore.every((r) => r.Name.includes("a_b")), "an underscore is not a single-character wildcard");
  const [bracket] = await exec("usp_Board_List", { ActorUserId: PM, Search: "[draft]", WithoutProject: true });
  ok(bracket.every((r) => r.Name.includes("[draft]")), "a bracket is not a character class");

  // --- a board whose project was deleted stops being reachable --------------------------------
  const Q = await project(`Boards gone ${Date.now()}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: Q,
    AssigneesJson: JSON.stringify([{ role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" }]),
    ActorUserId: PM,
  });
  const qb = await board({ ProjectId: Q, Name: "Q board", ActorUserId: PM });
  const [[qrow]] = await exec("usp_Project_GetById", { ProjectId: Q, ActorUserId: PM });
  await exec("usp_Project_Delete", { ProjectId: Q, RowVer: qrow.RowVer, ActorUserId: PM });
  await expectCode(50001, "a board of a deleted project reads as missing", () =>
    exec("usp_Board_GetById", { BoardId: qb.BoardId, ActorUserId: PM }));
  const [afterDelete] = await exec("usp_Board_List", { ActorUserId: PM, PageSize: 100 });
  ok(!afterDelete.some((r) => r.BoardId === qb.BoardId), "a board of a deleted project leaves the list");

  // --- the cross-project list returns only what the actor may see -----------------------------
  const [viewerList] = await exec("usp_Board_List", { ActorUserId: VIEWER, PageSize: 100 });
  ok(viewerList.every((r) => r.ActorAccess), "every listed board carries a level");
  ok(viewerList.some((r) => r.BoardId === sb.BoardId), "a standalone board is listed for everyone");
  const [options] = await exec("usp_Board_ListOptions", { ActorUserId: VIEWER, WithoutProject: true });
  ok(options.every((r) => r.ProjectId === null), "the options picker honours the standalone filter");

  // --- columns follow the board's access, locking the board row first (ADR-0038, slice B2) -------
  const R = await project(`Boards columns ${Date.now()}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: R,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  const rb = await board({ ProjectId: R, Name: "Columns board", ActorUserId: PM });

  await expectCode(50003, "a viewer cannot add a column to a project board", () =>
    exec("usp_BoardColumn_Create", { BoardId: rb.BoardId, Name: "Blocked", Category: "doing", WipLimit: null, ActorUserId: VIEWER }));
  await expectCode(50003, "an outsider cannot add a column", () =>
    exec("usp_BoardColumn_Create", { BoardId: rb.BoardId, Name: "Blocked", Category: "doing", WipLimit: null, ActorUserId: OUTSIDER }));
  await expectCode(50001, "a column on a board that does not exist", () =>
    exec("usp_BoardColumn_Create", { BoardId: 2147483600, Name: "Nowhere", Category: "todo", WipLimit: null, ActorUserId: PM }));
  await expectCode(50005, "a column name already used on the board", () =>
    exec("usp_BoardColumn_Create", { BoardId: rb.BoardId, Name: "To do", Category: "todo", WipLimit: null, ActorUserId: CONTRIB }));
  await expectCode(50004, "a column category the CHECK would reject", () =>
    exec("usp_BoardColumn_Create", { BoardId: rb.BoardId, Name: "Odd", Category: "archive", WipLimit: null, ActorUserId: CONTRIB }));
  await expectCode(50004, "a wip limit out of range", () =>
    exec("usp_BoardColumn_Create", { BoardId: rb.BoardId, Name: "Odd", Category: "doing", WipLimit: 0, ActorUserId: CONTRIB }));

  const [[newCol]] = await exec("usp_BoardColumn_Create", {
    BoardId: rb.BoardId, Name: "In review", Category: "doing", WipLimit: 5, ActorUserId: CONTRIB,
  });
  ok(newCol.SortOrder === 4 && newCol.WipLimit === 5, "a contributor adds a column after the three starters");

  await expectCode(50002, "a stale row version cannot rename a column", () =>
    exec("usp_BoardColumn_Update", { BoardColumnId: newCol.BoardColumnId, RowVer: 1, Name: "x", Category: "doing", WipLimit: 5, ActorUserId: CONTRIB }));
  const [[renamed]] = await exec("usp_BoardColumn_Update", {
    BoardColumnId: newCol.BoardColumnId, RowVer: newCol.RowVer, Name: "  Reviewing  ", Category: "doing", WipLimit: null, ActorUserId: CONTRIB,
  });
  ok(renamed.Name === "Reviewing" && renamed.WipLimit === null, "an update trims the name and clears the limit");
  await expectCode(50003, "a viewer cannot rename a column", () =>
    exec("usp_BoardColumn_Update", { BoardColumnId: newCol.BoardColumnId, RowVer: renamed.RowVer, Name: "Nope", Category: "doing", WipLimit: null, ActorUserId: VIEWER }));

  const [[moved]] = await exec("usp_BoardColumn_Move", {
    BoardColumnId: newCol.BoardColumnId, Direction: "up", RowVer: renamed.RowVer, ActorUserId: CONTRIB,
  });
  ok(moved.SortOrder === 3, "moving a column up lowers its position by one");

  // A revoked 'boards:update' override stops the move, on the project board only.
  await exec("usp_ProjectPermission_Set", {
    ProjectId: R, UserId: CONTRIB,
    OverridesJson: JSON.stringify([{ module: "boards", verb: "update", allowed: false }]),
    ActorUserId: PM,
  });
  await expectCode(50003, "a revoked contributor cannot move a column", () =>
    exec("usp_BoardColumn_Move", { BoardColumnId: newCol.BoardColumnId, Direction: "down", RowVer: moved.RowVer, ActorUserId: CONTRIB }));

  // Put the override back, because it is project-wide and this script keeps using project R.
  // Left in place it silently changed the meaning of every later contributor check: the two
  // "a contributor cannot delete …" cases below would have been refused by the revoked override
  // rather than by the Manager level they mean to assert, and the sprint lifecycle checks, which
  // legitimately expect a contributor to succeed, failed outright.
  await exec("usp_ProjectPermission_Set", {
    ProjectId: R, UserId: CONTRIB, OverridesJson: "[]", ActorUserId: PM,
  });
  const [[restored]] = await exec("usp_BoardColumn_Move", {
    BoardColumnId: newCol.BoardColumnId, Direction: "down", RowVer: moved.RowVer, ActorUserId: CONTRIB,
  });
  ok(restored.SortOrder === 4, `clearing the override restores the move (${restored.SortOrder})`);

  // On a standalone board every user is a Contributor, so any user may edit its columns.
  const [[sharedCol]] = await exec("usp_BoardColumn_Create", {
    BoardId: sb.BoardId, Name: "Parking", Category: "todo", WipLimit: null, ActorUserId: VIEWER,
  });
  ok(sharedCol.BoardColumnId > 0, "any user adds a column to a standalone board");

  // --- cards: the board is the access scope, and the WIP limit is the board's own rule ---------
  const cb = await board({ ProjectId: R, Name: "Cards board", ActorUserId: PM });
  const [, cbCols] = await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  const todoCol = cbCols.find((c) => c.Category === "todo");
  const doneCol = cbCols.find((c) => c.Category === "done");
  const doingCol = cbCols.find((c) => c.Category === "doing");
  ok(cbCols.length === 3 && todoCol.WipCount === 0 && todoCol.CardCount === 0,
    "a new board reads back three empty columns");

  const newCard = (params) => exec("usp_BoardCard_Create", {
    BoardId: cb.BoardId, BoardColumnId: todoCol.BoardColumnId, BoardSprintId: null,
    Notes: null, AssigneeUserId: null, DueDate: null, StoryPoints: null, Color: null,
    ActorUserId: PM, ...params,
  });

  await expectCode(50003, "a viewer cannot add a card", () =>
    newCard({ Title: "Nope", ActorUserId: VIEWER }));
  await expectCode(50003, "an outsider cannot add a card", () =>
    newCard({ Title: "Nope", ActorUserId: OUTSIDER }));
  await expectCode(50004, "a card named with another board's column", () =>
    newCard({ Title: "Elsewhere", BoardColumnId: newCol.BoardColumnId }));
  await expectCode(50004, "a card title that is blank", () => newCard({ Title: "   " }));
  await expectCode(50004, "story points out of range", () =>
    newCard({ Title: "Big", StoryPoints: 1000 }));
  await expectCode(50004, "a colour that is not on the palette", () =>
    newCard({ Title: "Loud", Color: "red;background:url(x)" }));
  await expectCode(50004, "an assignee with no access to the board's project", () =>
    newCard({ Title: "Assigned", AssigneeUserId: OUTSIDER }));

  // SortKey is BIGINT, which the driver hands back as a string: compare the numbers, or "2" > "10".
  const rank = (c) => Number(c.SortKey);

  const [[card1]] = await newCard({ Title: "  First card  ", StoryPoints: 3, Color: "blue" });
  ok(card1.Title === "First card" && rank(card1) > 0 && card1.RequirementId === null,
    "a card is created, trimmed, ranked and carries no requirement");

  const [[card2]] = await newCard({ Title: "Second card", AssigneeUserId: CONTRIB });
  ok(rank(card2) > rank(card1), "the next card ranks after the first");

  // An edit owns its own fields and cannot move the card: the proc takes no column or sprint.
  await expectCode(50002, "a stale row version cannot edit a card", () =>
    exec("usp_BoardCard_Update", {
      BoardCardId: card1.BoardCardId, RowVer: 1, Title: "x", Notes: null, AssigneeUserId: null,
      DueDate: null, StoryPoints: null, Color: null, ActorUserId: PM,
    }));
  const [[edited]] = await exec("usp_BoardCard_Update", {
    BoardCardId: card1.BoardCardId, RowVer: Number(card1.RowVer), Title: "First, renamed",
    Notes: null, AssigneeUserId: null, DueDate: null, StoryPoints: 5, Color: null, ActorUserId: PM,
  });
  ok(edited.Title === "First, renamed" && edited.StoryPoints === 5
     && edited.BoardColumnId === card1.BoardColumnId && rank(edited) === rank(card1),
    "an edit changes the card's own fields and neither its column nor its rank");

  // A move takes the card to another column and keeps the board-wide order unambiguous.
  const [[movedCard]] = await exec("usp_BoardCard_Move", {
    BoardCardId: card2.BoardCardId, RowVer: Number(card2.RowVer), ToColumnId: doingCol.BoardColumnId,
    ToSprintId: null, SprintSet: 0, BeforeCardId: edited.BoardCardId, ActorUserId: PM,
  });
  ok(movedCard.BoardColumnId === doingCol.BoardColumnId && rank(movedCard) < rank(edited),
    "a move changes the column and lands the card before its neighbour");
  await expectCode(50004, "a move to another board's column", () =>
    exec("usp_BoardCard_Move", {
      BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer),
      ToColumnId: newCol.BoardColumnId, ToSprintId: null, SprintSet: 0, BeforeCardId: null,
      ActorUserId: PM,
    }));
  await expectCode(50002, "a move before a card that is not on this board", () =>
    exec("usp_BoardCard_Move", {
      BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer),
      ToColumnId: todoCol.BoardColumnId, ToSprintId: null, SprintSet: 0,
      BeforeCardId: 2147483600, ActorUserId: PM,
    }));
  await expectCode(50004, "a card cannot be placed before itself", () =>
    exec("usp_BoardCard_Move", {
      BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer),
      ToColumnId: todoCol.BoardColumnId, ToSprintId: null, SprintSet: 0,
      BeforeCardId: card1.BoardCardId, ActorUserId: PM,
    }));

  // The WIP limit: 'In progress' was created with a limit of 3 and already holds one card.
  const fill = [];
  for (let i = 0; i < 2; i++) {
    const [[c]] = await newCard({ Title: `Filler ${i}` });
    fill.push(c);
  }
  for (const c of fill) {
    await exec("usp_BoardCard_Move", {
      BoardCardId: c.BoardCardId, RowVer: Number(c.RowVer), ToColumnId: doingCol.BoardColumnId,
      ToSprintId: null, SprintSet: 0, BeforeCardId: null, ActorUserId: PM,
    });
  }
  await expectCode(50007, "a card that would take a column past its limit", () =>
    exec("usp_BoardCard_Move", {
      BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer),
      ToColumnId: doingCol.BoardColumnId, ToSprintId: null, SprintSet: 0, BeforeCardId: null,
      ActorUserId: PM,
    }));
  // A reorder WITHIN the full column still works: the card does not count against itself.
  const [[reordered]] = await exec("usp_BoardCard_Move", {
    BoardCardId: movedCard.BoardCardId, RowVer: Number(movedCard.RowVer),
    ToColumnId: doingCol.BoardColumnId, ToSprintId: null, SprintSet: 0, BeforeCardId: null,
    ActorUserId: PM,
  });
  ok(reordered.BoardColumnId === doingCol.BoardColumnId,
    "a reorder inside a full column is not refused by its own limit");

  // --- the board read -------------------------------------------------------------------------
  const [header, readCols, phases, sprints, readCards] =
    await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  ok(header.length === 1 && header[0].Stamp > 0 && header[0].ActiveSprintId === null,
    "the board read returns one header with a freshness stamp");
  ok(header[0].BacklogCount === 4, `every card with no sprint is in the backlog (${header[0].BacklogCount})`);
  ok(phases.length === 0 && sprints.length === 0, "a board with no plan reads back no phases or sprints");
  const doingRead = readCols.find((c) => c.BoardColumnId === doingCol.BoardColumnId);
  ok(doingRead.WipCount === 3 && doingRead.WipLimit === 3,
    `the column reports its load against its limit (${doingRead.WipCount}/${doingRead.WipLimit})`);
  ok(readCards.length === 4 && readCards.every((c) => c.RequirementState === "none"),
    "every card reads back, and none claims a requirement it does not have");
  ok(readCards.every((c) => c.RequirementText === null),
    "a card with no requirement carries no requirement text");

  const [searched] = await exec("usp_Board_GetBoard", {
    BoardId: cb.BoardId, ActorUserId: PM, Search: "First, renamed",
  });
  ok(searched.length === 1, "the board header still returns once when a search is given");
  const [, , , , capped] = await exec("usp_Board_GetBoard", {
    BoardId: cb.BoardId, ActorUserId: PM, CardsPerList: 1,
  });
  ok(capped.length <= readCols.length,
    `cards are capped per list, not per board (${capped.length} for ${readCols.length} columns)`);
  await expectCode(50004, "a view that is neither board nor plan", () =>
    exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM, View: "gallery" }));
  await expectCode(50003, "an outsider reads the board", () =>
    exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: OUTSIDER }));

  // --- the assignee picker offers exactly who the write accepts --------------------------------
  const [assignees] = await exec("usp_Board_ListAssignees", { BoardId: cb.BoardId, ActorUserId: PM });
  ok(assignees.some((u) => u.UserId === CONTRIB), "a project member can be assigned work");
  ok(!assignees.some((u) => u.UserId === OUTSIDER), "someone with no access is never offered");
  ok(Object.keys(assignees[0]).sort().join() === "DisplayName,UserId",
    "the picker returns names and ids only");
  const [shared] = await exec("usp_Board_ListAssignees", { BoardId: sb.BoardId, ActorUserId: VIEWER });
  ok(shared.some((u) => u.UserId === OUTSIDER),
    "on a standalone board, which everyone may work, everyone can be assigned");

  // --- deleting a card and a column ------------------------------------------------------------
  await expectCode(50003, "a contributor cannot delete a card", () =>
    exec("usp_BoardCard_Delete", {
      BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer), ActorUserId: CONTRIB,
    }));
  await exec("usp_BoardCard_Delete", {
    BoardCardId: card1.BoardCardId, RowVer: Number(edited.RowVer), ActorUserId: PM,
  });
  const [, , , , afterCardDelete] =
    await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  ok(!afterCardDelete.some((c) => c.BoardCardId === card1.BoardCardId),
    "a deleted card leaves the board");

  const [, colsBeforeDelete] = await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  const doingNow = colsBeforeDelete.find((c) => c.BoardColumnId === doingCol.BoardColumnId);
  await expectCode(50004, "deleting a column with cards and no target", () =>
    exec("usp_BoardColumn_Delete", {
      BoardColumnId: doingCol.BoardColumnId, RowVer: Number(doingNow.RowVer),
      TargetColumnId: null, ActorUserId: PM,
    }));
  await expectCode(50004, "reflowing a column into itself", () =>
    exec("usp_BoardColumn_Delete", {
      BoardColumnId: doingCol.BoardColumnId, RowVer: Number(doingNow.RowVer),
      TargetColumnId: doingCol.BoardColumnId, ActorUserId: PM,
    }));
  await expectCode(50003, "a contributor cannot delete a column", () =>
    exec("usp_BoardColumn_Delete", {
      BoardColumnId: doingCol.BoardColumnId, RowVer: Number(doingNow.RowVer),
      TargetColumnId: doneCol.BoardColumnId, ActorUserId: CONTRIB,
    }));
  const [[reflow]] = await exec("usp_BoardColumn_Delete", {
    BoardColumnId: doingCol.BoardColumnId, RowVer: Number(doingNow.RowVer),
    TargetColumnId: doneCol.BoardColumnId, ActorUserId: PM,
  });
  ok(reflow.MovedCards === 3 && reflow.MovedToColumnId === doneCol.BoardColumnId,
    `deleting a column moves its cards and says how many (${reflow.MovedCards})`);
  const [, colsAfter, , , cardsAfter] =
    await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  ok(!colsAfter.some((c) => c.BoardColumnId === doingCol.BoardColumnId), "the column is gone");
  ok(cardsAfter.every((c) => c.BoardColumnId !== doingCol.BoardColumnId),
    "no card is left pointing at the deleted column");

  // A board keeps at least one column, so the last two deletes cannot both succeed.
  const [, twoLeft] = await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  for (const col of twoLeft.slice(0, twoLeft.length - 1)) {
    const [, fresh] = await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
    const row = fresh.find((c) => c.BoardColumnId === col.BoardColumnId);
    const target = fresh.find((c) => c.BoardColumnId !== col.BoardColumnId);
    await exec("usp_BoardColumn_Delete", {
      BoardColumnId: col.BoardColumnId, RowVer: Number(row.RowVer),
      TargetColumnId: target.BoardColumnId, ActorUserId: PM,
    });
  }
  const [, lastOne] = await exec("usp_Board_GetBoard", { BoardId: cb.BoardId, ActorUserId: PM });
  ok(lastOne.length === 1, `one column is left (${lastOne.length})`);
  await expectCode(50004, "a board never loses its last column", () =>
    exec("usp_BoardColumn_Delete", {
      BoardColumnId: lastOne[0].BoardColumnId, RowVer: Number(lastOne[0].RowVer),
      TargetColumnId: null, ActorUserId: PM,
    }));

  // ---- Phases and sprints (slice B3) -------------------------------------------------------
  // A fresh board, so the column categories and card counts here are not the ones the column
  // reflow above left behind. Every RowVer the driver returns is BIGINT, so it comes back as a
  // STRING and is wrapped in Number() before it is sent or compared (LESSONS §37).
  const sp = await board({ Name: `Sprint board ${Date.now()}`, ProjectId: R, ActorUserId: PM });
  const [, spCols] = await exec("usp_Board_GetBoard", { BoardId: sp.BoardId, ActorUserId: PM });
  const sTodo = spCols.find((c) => c.Category === "todo");
  const sDone = spCols.find((c) => c.Category === "done");

  // Phases: a Contributor may add and edit one, only a Manager may delete it.
  const [[phase]] = await exec("usp_BoardPhase_Create", {
    BoardId: sp.BoardId, Name: "Discovery", StartDate: "2026-11-01", EndDate: "2026-11-28",
    ActorUserId: CONTRIB,
  });
  ok(phase.SortOrder === 1, `the first phase sorts first (${phase.SortOrder})`);
  await expectCode(50003, "a viewer cannot add a phase", () =>
    exec("usp_BoardPhase_Create", {
      BoardId: sp.BoardId, Name: "Nope", StartDate: null, EndDate: null, ActorUserId: VIEWER,
    }));
  await expectCode(50004, "a phase that ends before it starts", () =>
    exec("usp_BoardPhase_Create", {
      BoardId: sp.BoardId, Name: "Backwards", StartDate: "2026-11-28", EndDate: "2026-11-01",
      ActorUserId: PM,
    }));
  const [[phase2]] = await exec("usp_BoardPhase_Create", {
    BoardId: sp.BoardId, Name: "Delivery", StartDate: null, EndDate: null, ActorUserId: PM,
  });
  ok(phase2.StartDate === null, "a phase can be named before it is dated");

  const [[phaseMoved]] = await exec("usp_BoardPhase_Move", {
    BoardPhaseId: phase2.BoardPhaseId, Direction: "up", RowVer: Number(phase2.RowVer),
    ActorUserId: PM,
  });
  ok(phaseMoved.SortOrder === 1, `a phase moves up (${phaseMoved.SortOrder})`);
  await expectCode(50002, "a phase move against a stale row version", () =>
    exec("usp_BoardPhase_Move", {
      BoardPhaseId: phase2.BoardPhaseId, Direction: "down", RowVer: Number(phase2.RowVer),
      ActorUserId: PM,
    }));
  await expectCode(50004, "a phase direction that is neither up nor down", () =>
    exec("usp_BoardPhase_Move", {
      BoardPhaseId: phase2.BoardPhaseId, Direction: "sideways",
      RowVer: Number(phaseMoved.RowVer), ActorUserId: PM,
    }));

  // Sprints: created planned, and a phase that is not this board's is refused.
  await expectCode(50004, "a sprint in another board's phase", () =>
    exec("usp_BoardSprint_Create", {
      BoardId: sp.BoardId, Name: "Wrong phase", StartDate: "2026-11-01", EndDate: "2026-11-14",
      Goal: null, BoardPhaseId: 0, ActorUserId: PM,
    }));
  await expectCode(50004, "a sprint that ends before it starts", () =>
    exec("usp_BoardSprint_Create", {
      BoardId: sp.BoardId, Name: "Backwards", StartDate: "2026-11-14", EndDate: "2026-11-01",
      Goal: null, BoardPhaseId: null, ActorUserId: PM,
    }));
  const newSprint = (params) => exec("usp_BoardSprint_Create", {
    BoardId: sp.BoardId, StartDate: "2026-11-01", EndDate: "2026-11-14", Goal: null,
    BoardPhaseId: null, ActorUserId: PM, ...params,
  });
  const [[s1]] = await newSprint({ Name: "Sprint 1", BoardPhaseId: phase.BoardPhaseId });
  const [[s2]] = await newSprint({ Name: "Sprint 2" });
  ok(s1.State === "planned" && s1.StartedAtUtc === null,
    `a new sprint is planned with no stamps (${s1.State})`);

  // The read model groups them: set 3 is the phases, set 4 the sprints with their totals.
  const [, , readPhases, readSprints] =
    await exec("usp_Board_GetBoard", { BoardId: sp.BoardId, ActorUserId: PM });
  ok(readPhases.length === 2, `the board reads back both phases (${readPhases.length})`);
  ok(readSprints.length === 2, `the board reads back both sprints (${readSprints.length})`);
  ok(readSprints.every((r) => r.CardCount === 0 && r.PointTotal === 0),
    "an empty sprint totals zero cards and zero points");

  // Three cards in the first sprint: two unfinished, one already in the done column.
  const sprintCard = (columnId, title, points, sprintId) => exec("usp_BoardCard_Create", {
    BoardId: sp.BoardId, BoardColumnId: columnId, BoardSprintId: sprintId,
    Title: title, Notes: null, AssigneeUserId: null, DueDate: null, StoryPoints: points,
    Color: null, ActorUserId: PM,
  });
  const [[openCard]] = await sprintCard(sTodo.BoardColumnId, "Still open", 3, s1.BoardSprintId);
  await sprintCard(sTodo.BoardColumnId, "Also open", 2, s1.BoardSprintId);
  const [[doneCard]] = await sprintCard(sDone.BoardColumnId, "Finished", 5, s1.BoardSprintId);

  // Start: only a planned sprint, and only one at a time.
  await expectCode(50003, "a viewer cannot start a sprint", () =>
    exec("usp_BoardSprint_Start", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(s1.RowVer), ActorUserId: VIEWER,
    }));
  await expectCode(50002, "a start against a stale row version", () =>
    exec("usp_BoardSprint_Start", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(s1.RowVer) - 1, ActorUserId: PM,
    }));
  const [[started]] = await exec("usp_BoardSprint_Start", {
    BoardSprintId: s1.BoardSprintId, RowVer: Number(s1.RowVer), ActorUserId: CONTRIB,
  });
  ok(started.State === "active" && started.StartedAtUtc !== null,
    `starting a sprint stamps it active (${started.State})`);
  await expectCode(50007, "a second sprint cannot start while one is running", () =>
    exec("usp_BoardSprint_Start", {
      BoardSprintId: s2.BoardSprintId, RowVer: Number(s2.RowVer), ActorUserId: PM,
    }));
  await expectCode(50004, "the active sprint cannot be started again", () =>
    exec("usp_BoardSprint_Start", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(started.RowVer), ActorUserId: PM,
    }));

  // While a sprint is active the board's scope narrows to its cards, so the header names it.
  const [[activeHeader]] =
    await exec("usp_Board_GetBoard", { BoardId: sp.BoardId, ActorUserId: PM });
  ok(activeHeader.ActiveSprintId === s1.BoardSprintId,
    `the board names its active sprint (${activeHeader.ActiveSprintId})`);

  // An active sprint still edits; neither a Contributor nor anyone else may delete the active one.
  const [[sprintEdited]] = await exec("usp_BoardSprint_Update", {
    BoardSprintId: s1.BoardSprintId, RowVer: Number(started.RowVer), Name: "Sprint one",
    StartDate: "2026-11-01", EndDate: "2026-11-15", Goal: "Ship the picker",
    BoardPhaseId: phase.BoardPhaseId, ActorUserId: PM,
  });
  ok(sprintEdited.Goal === "Ship the picker", "an active sprint can still be edited");
  await expectCode(50003, "a contributor cannot delete a sprint", () =>
    exec("usp_BoardSprint_Delete", {
      BoardSprintId: s2.BoardSprintId, RowVer: Number(s2.RowVer), ActorUserId: CONTRIB,
    }));
  await expectCode(50004, "the active sprint is completed, never deleted", () =>
    exec("usp_BoardSprint_Delete", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(sprintEdited.RowVer), ActorUserId: PM,
    }));

  // Complete: the unfinished cards move, the done one stays, and the counts say so.
  await expectCode(50004, "a planned sprint cannot be completed", () =>
    exec("usp_BoardSprint_Complete", {
      BoardSprintId: s2.BoardSprintId, RowVer: Number(s2.RowVer),
      UnfinishedToSprintId: null, ActorUserId: PM,
    }));
  await expectCode(50004, "unfinished cards cannot move into the sprint being completed", () =>
    exec("usp_BoardSprint_Complete", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(sprintEdited.RowVer),
      UnfinishedToSprintId: s1.BoardSprintId, ActorUserId: PM,
    }));
  await expectCode(50004, "unfinished cards cannot move to a sprint off this board", () =>
    exec("usp_BoardSprint_Complete", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(sprintEdited.RowVer),
      UnfinishedToSprintId: 0, ActorUserId: PM,
    }));
  const [[completed]] = await exec("usp_BoardSprint_Complete", {
    BoardSprintId: s1.BoardSprintId, RowVer: Number(sprintEdited.RowVer),
    UnfinishedToSprintId: s2.BoardSprintId, ActorUserId: CONTRIB,
  });
  ok(completed.MovedCards === 2 && completed.KeptCards === 1,
    `completing moves the unfinished and keeps the done (${completed.MovedCards}/${completed.KeptCards})`);
  ok(completed.MovedToSprintId === s2.BoardSprintId, "it reports where the unfinished work went");

  // The PLAN view, not the board view. The board view returns only the cards in the board's
  // working scope, and a card left behind in a completed sprint is deliberately outside it — so
  // the read that proves where the cards ended up has to be the one allowed to see them. The plan
  // view skips the scope filter and groups every live card by sprint.
  const [, , , afterSprints, afterCards] = await exec("usp_Board_GetBoard", {
    BoardId: sp.BoardId, ActorUserId: PM, View: "plan", CardsPerList: 200,
  });
  const stayed = afterCards.find((c) => c.BoardCardId === doneCard.BoardCardId);
  const movedOut = afterCards.find((c) => c.BoardCardId === openCard.BoardCardId);
  ok(stayed.BoardSprintId === s1.BoardSprintId, "a card in a done column stays in the sprint");
  ok(movedOut.BoardSprintId === s2.BoardSprintId, "an unfinished card moves to the chosen sprint");
  ok(movedOut.BoardColumnId === sTodo.BoardColumnId,
    "a card that changes sprint keeps the column it was in");
  const s1After = afterSprints.find((r) => r.BoardSprintId === s1.BoardSprintId);
  ok(s1After.State === "completed" && s1After.CompletedAtUtc !== null,
    `the sprint is completed and stamped (${s1After.State})`);

  // A completed sprint is the record of what was done: read-only, and never deleted.
  await expectCode(50004, "a completed sprint cannot be edited", () =>
    exec("usp_BoardSprint_Update", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(s1After.RowVer), Name: "Rewritten",
      StartDate: "2026-11-01", EndDate: "2026-11-15", Goal: null, BoardPhaseId: null,
      ActorUserId: PM,
    }));
  await expectCode(50004, "a completed sprint cannot be deleted", () =>
    exec("usp_BoardSprint_Delete", {
      BoardSprintId: s1.BoardSprintId, RowVer: Number(s1After.RowVer), ActorUserId: PM,
    }));

  // With the first sprint closed the second can start: the one-active rule frees up.
  const s2Now = afterSprints.find((r) => r.BoardSprintId === s2.BoardSprintId);
  const [[s2Started]] = await exec("usp_BoardSprint_Start", {
    BoardSprintId: s2.BoardSprintId, RowVer: Number(s2Now.RowVer), ActorUserId: PM,
  });
  ok(s2Started.State === "active", "once one sprint is completed the next can start");

  // Deleting a planned sprint sends its cards to the backlog with their columns intact.
  const [[s3]] = await newSprint({ Name: "Sprint 3" });
  const [[parkedCard]] =
    await sprintCard(sTodo.BoardColumnId, "Parked", null, s3.BoardSprintId);
  const [[dropped]] = await exec("usp_BoardSprint_Delete", {
    BoardSprintId: s3.BoardSprintId, RowVer: Number(s3.RowVer), ActorUserId: PM,
  });
  ok(dropped.CardsToBacklog === 1, `deleting a sprint reports its cards (${dropped.CardsToBacklog})`);
  // Plan view again: a sprint is active by now, so the board view's scope is that sprint's cards
  // and a card sent to the backlog is outside it by design.
  const [, , , , backlogCards] = await exec("usp_Board_GetBoard", {
    BoardId: sp.BoardId, ActorUserId: PM, View: "plan", CardsPerList: 200,
  });
  const parked = backlogCards.find((c) => c.BoardCardId === parkedCard.BoardCardId);
  ok(parked.BoardSprintId === null, "a deleted sprint's card is in the backlog");
  ok(parked.BoardColumnId === sTodo.BoardColumnId, "and it kept its column");

  // Deleting a phase releases its sprints rather than taking them with it.
  const [, , livePhases] = await exec("usp_Board_GetBoard", { BoardId: sp.BoardId, ActorUserId: PM });
  const phaseNow = livePhases.find((p) => p.BoardPhaseId === phase.BoardPhaseId);
  await expectCode(50003, "a contributor cannot delete a phase", () =>
    exec("usp_BoardPhase_Delete", {
      BoardPhaseId: phase.BoardPhaseId, RowVer: Number(phaseNow.RowVer), ActorUserId: CONTRIB,
    }));
  const [[released]] = await exec("usp_BoardPhase_Delete", {
    BoardPhaseId: phase.BoardPhaseId, RowVer: Number(phaseNow.RowVer), ActorUserId: PM,
  });
  ok(released.ReleasedSprints === 1,
    `deleting a phase releases its sprints (${released.ReleasedSprints})`);
  const [, , phasesLeft, sprintsLeft] =
    await exec("usp_Board_GetBoard", { BoardId: sp.BoardId, ActorUserId: PM });
  ok(!phasesLeft.some((p) => p.BoardPhaseId === phase.BoardPhaseId), "the phase is gone");
  ok(sprintsLeft.every((r) => r.BoardPhaseId !== phase.BoardPhaseId),
    "no live sprint is left pointing at the deleted phase");

  // An outsider reaches none of it, and a missing id answers NOT_FOUND rather than FORBIDDEN.
  await expectCode(50003, "an outsider cannot add a phase", () =>
    exec("usp_BoardPhase_Create", {
      BoardId: sp.BoardId, Name: "Theirs", StartDate: null, EndDate: null, ActorUserId: OUTSIDER,
    }));
  await expectCode(50003, "an outsider cannot start a sprint", () =>
    exec("usp_BoardSprint_Start", {
      BoardSprintId: s2.BoardSprintId, RowVer: Number(s2Started.RowVer), ActorUserId: OUTSIDER,
    }));
  await expectCode(50001, "a sprint id that does not exist", () =>
    exec("usp_BoardSprint_Start", { BoardSprintId: 0, RowVer: 1, ActorUserId: PM }));
  await expectCode(50001, "a phase id that does not exist", () =>
    exec("usp_BoardPhase_Delete", { BoardPhaseId: 0, RowVer: 1, ActorUserId: PM }));

  // --- Linking a board to a project (usp_Board_SetProject, B4) -------------------------------
  // Two scopes, two different answers, so each half is isolated: the board side by an actor who
  // holds the project but not the board, the project side by an actor who holds the board but not
  // the project. A Contributor is deliberately used for the board-side refusal, because Manager is
  // what this proc demands there and Contributor is what the rest of the module demands.
  // NOT COVERED HERE: the foreign-requirement refusal and @RemoveForeignCards. No card can carry a
  // requirement until usp_BoardCard_Package (B5) — usp_BoardCard_Create takes no @RequirementId —
  // so the state that branch exists for cannot be built yet, and a test that set
  // app.BoardCard.RequirementId behind the procs' backs would assert a state no proc can produce.
  // Those rows land with Package, together with the redaction rows that wait on it for the same
  // reason. Until then the branch is held by src/tests/board-sql-guardrails.test.ts alone.
  const linkable = await board({ Name: "Linkable", ActorUserId: PM });
  await expectCode(50003, "a contributor cannot link a standalone board they did not create", () =>
    exec("usp_Board_SetProject", {
      BoardId: linkable.BoardId, RowVer: Number(linkable.RowVer),
      ProjectId: P, RemoveForeignCards: 0, ActorUserId: CONTRIB,
    }));

  // The board side passes here (its creator is its Manager) and the project side is what refuses:
  // without the second check this would succeed and drop a board into a project nobody authorised.
  const theirs = await board({ Name: "Theirs", ActorUserId: OUTSIDER });
  await expectCode(50003, "a board's own manager cannot land it in a project they cannot reach",
    () => exec("usp_Board_SetProject", {
      BoardId: theirs.BoardId, RowVer: Number(theirs.RowVer),
      ProjectId: P, RemoveForeignCards: 0, ActorUserId: OUTSIDER,
    }));

  const [[linked]] = await exec("usp_Board_SetProject", {
    BoardId: linkable.BoardId, RowVer: Number(linkable.RowVer),
    ProjectId: P, RemoveForeignCards: 0, ActorUserId: PM,
  });
  ok(linked.ProjectId === P, `a manager of both sides links the board (${linked.ProjectId})`);
  ok(linked.RemovedCards === 0, `a board with no requirement cards costs none (${linked.RemovedCards})`);
  const [[plainContributor]] = await exec("usp_Board_GetById", {
    BoardId: linkable.BoardId, ActorUserId: CONTRIB,
  });
  ok(plainContributor.ActorAccess === "Contributor", "the relink fixture is an ordinary contributor");
  ok(!(plainContributor.ActorGrants || "").includes("delete"), "the earlier delete grant was cleared");

  await expectCode(50002, "linking against a stale row version", () =>
    exec("usp_Board_SetProject", {
      BoardId: linkable.BoardId, RowVer: Number(linkable.RowVer),
      ProjectId: R, RemoveForeignCards: 0, ActorUserId: PM,
    }));
  await expectCode(50003, "a contributor on the project cannot move its board", () =>
    exec("usp_Board_SetProject", {
      BoardId: linkable.BoardId, RowVer: Number(linked.RowVer),
      ProjectId: R, RemoveForeignCards: 0, ActorUserId: CONTRIB,
    }));

  const [[movedToR]] = await exec("usp_Board_SetProject", {
    BoardId: linkable.BoardId, RowVer: Number(linked.RowVer),
    ProjectId: R, RemoveForeignCards: 0, ActorUserId: PM,
  });
  ok(movedToR.ProjectId === R, `a board moves between projects (${movedToR.ProjectId})`);

  const [[unlinked]] = await exec("usp_Board_SetProject", {
    BoardId: linkable.BoardId, RowVer: Number(movedToR.RowVer),
    ProjectId: null, RemoveForeignCards: 0, ActorUserId: PM,
  });
  ok(unlinked.ProjectId === null, `a board unlinks to the standalone space (${unlinked.ProjectId})`);
  ok(unlinked.RemovedCards === 0, "unlinking takes no cards, since a standalone board may mix projects");

  await expectCode(50001, "a board id that does not exist", () =>
    exec("usp_Board_SetProject", {
      BoardId: 0, RowVer: 1, ProjectId: P, RemoveForeignCards: 0, ActorUserId: PM,
    }));

  console.log(`\n${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  // Name the call and keep the tally: a throw from a call that was expected to succeed used to
  // take every passing result with it, leaving a stack trace and no way to tell which of the
  // script's calls raised it.
  console.log(`\n${passes} passed, ${failures} failed before the error below`);
  if (lastCall) {
    console.log(`UNEXPECTED ERROR during ${lastCall.proc}`);
    console.log(`  params: ${JSON.stringify(lastCall.params)}`);
    if (e && e.number) console.log(`  code ${e.number} from ${e.procName || "?"}: ${e.message}`);
  }
  console.error(e);
  if (pool) await pool.close();
  process.exit(1);
});
