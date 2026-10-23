// Race checks for shared notebooks (ADR-0035 amendment 2026-10-23), where any user may write:
// parallel saves of one page at the same RowVer leave exactly one winner and no lost update;
// parallel page adds get distinct, gap-free places; a page add or save racing the notebook's
// delete leaves no live page behind; a reorder racing an add, a save racing the page's delete,
// two Admins deleting the same row, and a rename or reorder racing the notebook's delete each end
// in one valid outcome with no deadlock; parallel adds at the 500-page cap stop exactly at the
// cap, and a delete racing adds there admits at most one; and six users mixing adds, saves,
// reorders and deletes on one notebook see only valid outcomes. Runs in the CI
// db-apply job after the seeds (users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and
// locally: node db/tests/notes-race.cjs. Creates throwaway notebooks in the shared space, so never
// point it at a real database.
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
const OUTSIDER = 4;
const VIEWER = 5;
const USERS = [PM, OUTSIDER, VIEWER];
const PAGES_MAX = 500;
let pool;
let failures = 0;
let passes = 0;
const ok = (c, l) => (c ? passes++ : (failures++, console.log("FAIL", l)));
async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}
const one = async (proc, params) => (await exec(proc, params))[0][0];
const settle = (fns) => Promise.allSettled(fns.map((f) => f()));
const codes = (rs) => rs.map((r) => (r.status === "fulfilled" ? "ok" : r.reason.number));
const count = (list, code) => list.filter((c) => c === code).length;
const notebook = (title) =>
  one("usp_Note_Create", { ProjectId: null, Title: title, FirstTabTitle: "Page 1", ActorUserId: VIEWER });
const addPage = (noteId, title, actor = VIEWER) =>
  one("usp_NoteTab_Create", { NoteId: noteId, Title: title, ActorUserId: actor });
const pages = async (noteId) =>
  JSON.parse((await one("usp_Note_GetWithTabs", { NoteId: noteId, ActorUserId: ADMIN })).TabsJson || "[]");
const gapFree = (list) =>
  list.map((t) => t.SortOrder).sort((a, b) => a - b).every((s, i) => s === i + 1);
const codeOf = async (fn) => codes(await settle([fn]))[0];
const pageById = (noteTabId) => exec("usp_NoteTab_GetById", { NoteTabId: noteTabId, ActorUserId: ADMIN });
const freshNote = (noteId) => one("usp_Note_GetWithTabs", { NoteId: noteId, ActorUserId: ADMIN });
const deleteNote = (note) => exec("usp_Note_Delete", { NoteId: note.NoteId, RowVer: note.RowVer, ActorUserId: ADMIN });
const deletePage = (page) =>
  exec("usp_NoteTab_Delete", { NoteTabId: page.NoteTabId, RowVer: page.RowVer, ActorUserId: ADMIN });
const savePage = (page, text, actor) =>
  exec("usp_NoteTab_Update", {
    NoteTabId: page.NoteTabId, Title: page.Title, Content: `<p>${text}</p>`, SearchText: text,
    RowVer: page.RowVer, ActorUserId: actor,
  });
const reorderAll = (noteId, list, actor) =>
  exec("usp_NoteTab_Reorder", {
    NoteId: noteId, OrderJson: JSON.stringify(list.map((t) => ({ id: t.NoteTabId, rowVer: t.RowVer })).reverse()),
    ActorUserId: actor,
  });
const among = (list, ...allowed) => list.every((c) => allowed.includes(c));

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true }, pool: { max: 30 },
  });
  const stamp = `notes-race-${Date.now()}`;

  // 0. Reads take no shared locks (ADR-0045), so none of the races below can deadlock on a read.
  const { recordset: [db] } = await pool.request().query(
    "SELECT is_read_committed_snapshot_on AS Rcsi FROM sys.databases WHERE database_id = DB_ID()");
  ok(db.Rcsi === true, "READ_COMMITTED_SNAPSHOT is on (migration 042)");

  // 1. Eight saves of one page at the same RowVer: one winner, seven conflicts, no lost update.
  const n1 = await notebook(`${stamp} saves`);
  const [page] = await pages(n1.NoteId);
  const r1 = codes(await settle(Array.from({ length: 8 }, (_, i) => () =>
    exec("usp_NoteTab_Update", {
      NoteTabId: page.NoteTabId, Title: `Writer ${i}`, Content: `<p>writer ${i}</p>`,
      SearchText: `writer ${i}`, RowVer: page.RowVer, ActorUserId: USERS[i % USERS.length],
    }))));
  ok(count(r1, "ok") === 1 && count(r1, 50002) === 7, `one save wins, the rest conflict (${r1})`);
  const [saved] = await pages(n1.NoteId);
  ok(/^Writer \d$/.test(saved.Title) && saved.Content === `<p>${saved.Title.toLowerCase()}</p>`,
    "the stored page is one writer's whole save");

  // 2. Twenty parallel adds by different users: all succeed with distinct, gap-free places.
  const n2 = await notebook(`${stamp} adds`);
  const r2 = codes(await settle(Array.from({ length: 20 }, (_, i) => () =>
    addPage(n2.NoteId, `Add ${i}`, USERS[i % USERS.length]))));
  const after2 = await pages(n2.NoteId);
  ok(count(r2, "ok") === 20 && after2.length === 21 && gapFree(after2), `20 parallel adds get places 1..21 (${r2})`);

  // 3. A page add racing the Admin's delete of its notebook: one order or the other, no deadlock.
  for (let round = 0; round < 10; round++) {
    const n3 = await notebook(`${stamp} delete ${round}`);
    const fresh = await one("usp_Note_GetWithTabs", { NoteId: n3.NoteId, ActorUserId: ADMIN });
    const results = await settle([
      () => addPage(n3.NoteId, "Late page"),
      () => exec("usp_Note_Delete", { NoteId: n3.NoteId, RowVer: fresh.RowVer, ActorUserId: ADMIN }),
    ]);
    const [add, del] = codes(results);
    ok(del === "ok" && (add === "ok" || add === 50001), `round ${round}: delete wins or follows the add (${add}, ${del})`);
    if (results[0].status === "fulfilled") {
      const late = await codeOf(() => pageById(results[0].value.NoteTabId));
      ok(late === 50001, `round ${round}: the late page went with its notebook (${late})`);
    }
    const listed = (await exec("usp_Note_List", {
      ActorUserId: VIEWER, ProjectId: null, Search: `${stamp} delete ${round}`, SortBy: null,
      SortDir: "asc", Page: 1, PageSize: 10, WithoutProject: 1,
    }))[0];
    ok(listed.length === 0, `round ${round}: the deleted notebook leaves the list`);
  }

  // 4. A reorder racing an add: the reorder conflicts or lands first; places stay gap-free.
  for (let round = 0; round < 10; round++) {
    const n4 = await notebook(`${stamp} reorder ${round}`);
    await addPage(n4.NoteId, "B");
    await addPage(n4.NoteId, "C");
    const before = await pages(n4.NoteId);
    const order = before.map((t) => ({ id: t.NoteTabId, rowVer: t.RowVer })).reverse();
    const [reorder, add] = codes(await settle([
      () => exec("usp_NoteTab_Reorder", { NoteId: n4.NoteId, OrderJson: JSON.stringify(order), ActorUserId: PM }),
      () => addPage(n4.NoteId, "D", OUTSIDER),
    ]));
    const after4 = await pages(n4.NoteId);
    ok((reorder === "ok" || reorder === 50002) && add === "ok", `round ${round}: valid outcomes (${reorder}, ${add})`);
    ok(after4.length === 4 && gapFree(after4), `round ${round}: four pages in places 1..4`);
  }

  // 5. A save racing the Admin's delete of the same page: exactly one of them succeeds.
  for (let round = 0; round < 10; round++) {
    const n5 = await notebook(`${stamp} save-delete ${round}`);
    const target = await addPage(n5.NoteId, "Target");
    const [save, del] = codes(await settle([
      () => exec("usp_NoteTab_Update", {
        NoteTabId: target.NoteTabId, Title: "Target", Content: "<p>late edit</p>",
        SearchText: "late edit", RowVer: target.RowVer, ActorUserId: VIEWER,
      }),
      () => exec("usp_NoteTab_Delete", { NoteTabId: target.NoteTabId, RowVer: target.RowVer, ActorUserId: ADMIN }),
    ]));
    ok(count([save, del], "ok") === 1 && [save, del].every((c) => c === "ok" || c === 50001 || c === 50002),
      `round ${round}: one of save and delete wins (${save}, ${del})`);
  }

  // 6. Six parallel adds three short of the cap: three succeed, three are refused, 500 remain.
  const n6 = await notebook(`${stamp} cap`);
  for (let i = 2; i <= PAGES_MAX - 3; i++) await addPage(n6.NoteId, `Fill ${i}`);
  const r6 = codes(await settle(Array.from({ length: 6 }, (_, i) => () =>
    addPage(n6.NoteId, `Last ${i}`, USERS[i % USERS.length]))));
  const after6 = await pages(n6.NoteId);
  ok(count(r6, "ok") === 3 && count(r6, 50004) === 3, `the cap admits exactly three (${r6})`);
  ok(after6.length === PAGES_MAX && gapFree(after6), `the notebook stops at ${PAGES_MAX} pages, places gap-free`);
  const full = after6.map((t) => ({ id: t.NoteTabId, rowVer: t.RowVer })).reverse();
  const reordered = (await exec("usp_NoteTab_Reorder", {
    NoteId: n6.NoteId, OrderJson: JSON.stringify(full), ActorUserId: VIEWER,
  }))[0];
  ok(reordered.length === PAGES_MAX && reordered[0].NoteTabId === full[0].id, "a full notebook can still be reordered");

  // 7. Churn at the cap: an Admin's page delete racing six adds admits at most one add.
  const atCap = await pages(n6.NoteId);
  const [churnDelete, ...churnAdds] = codes(await settle([
    () => deletePage(atCap[0]),
    ...Array.from({ length: 6 }, (_, i) => () => addPage(n6.NoteId, `Churn ${i}`, USERS[i % USERS.length])),
  ]));
  const after7 = await pages(n6.NoteId);
  ok(churnDelete === "ok" && count(churnAdds, "ok") <= 1 && among(churnAdds, "ok", 50004),
    `delete plus adds at the cap admit at most one add (${churnDelete}, ${churnAdds})`);
  ok(after7.length === PAGES_MAX - 1 + count(churnAdds, "ok"), `the notebook never passes ${PAGES_MAX} (${after7.length})`);

  // 8. A page save racing the Admin's delete of its notebook: the page always goes with it.
  for (let round = 0; round < 10; round++) {
    const n8 = await notebook(`${stamp} save-notebook-delete ${round}`);
    const [p8] = await pages(n8.NoteId);
    const fresh = await freshNote(n8.NoteId);
    const [save, del] = codes(await settle([() => savePage(p8, "late", OUTSIDER), () => deleteNote(fresh)]));
    const after = await codeOf(() => pageById(p8.NoteTabId));
    ok(del === "ok" && among([save], "ok", 50001, 50002) && after === 50001,
      `round ${round}: save then delete or delete then refusal, page gone (${save}, ${del}, ${after})`);
  }

  // 9. Two Admins deleting the same page, the same notebook, or a page and its notebook at once.
  for (let round = 0; round < 5; round++) {
    const n9 = await notebook(`${stamp} double-delete ${round}`);
    const extra = await addPage(n9.NoteId, "Extra");
    const pageTwice = codes(await settle([() => deletePage(extra), () => deletePage(extra)]));
    ok(count(pageTwice, "ok") === 1 && among(pageTwice, "ok", 50001, 50002), `round ${round}: one page delete wins (${pageTwice})`);
    const fresh = await freshNote(n9.NoteId);
    const noteTwice = codes(await settle([() => deleteNote(fresh), () => deleteNote(fresh)]));
    ok(count(noteTwice, "ok") === 1 && among(noteTwice, "ok", 50001, 50002), `round ${round}: one notebook delete wins (${noteTwice})`);

    const n9b = await notebook(`${stamp} page-and-notebook ${round}`);
    const last = await addPage(n9b.NoteId, "Last");
    const freshB = await freshNote(n9b.NoteId);
    const [pageDel, noteDel] = codes(await settle([() => deletePage(last), () => deleteNote(freshB)]));
    ok(noteDel === "ok" && among([pageDel], "ok", 50001, 50002), `round ${round}: the notebook delete always lands (${pageDel}, ${noteDel})`);
  }

  // 10. A rename, or a reorder, racing the Admin's delete of the notebook.
  for (let round = 0; round < 5; round++) {
    const n10 = await notebook(`${stamp} rename-delete ${round}`);
    const fresh = await freshNote(n10.NoteId);
    const pair = codes(await settle([
      () => exec("usp_Note_Update", { NoteId: n10.NoteId, Title: "Renamed", RowVer: fresh.RowVer, ActorUserId: VIEWER }),
      () => deleteNote(fresh),
    ]));
    ok(count(pair, "ok") === 1 && among(pair, "ok", 50001, 50002), `round ${round}: rename or delete wins (${pair})`);

    const n10b = await notebook(`${stamp} reorder-delete ${round}`);
    await addPage(n10b.NoteId, "B");
    const list = await pages(n10b.NoteId);
    const freshB = await freshNote(n10b.NoteId);
    const [reorder, del] = codes(await settle([() => reorderAll(n10b.NoteId, list, PM), () => deleteNote(freshB)]));
    ok(del === "ok" && among([reorder], "ok", 50001, 50002), `round ${round}: the delete lands whatever the reorder did (${reorder}, ${del})`);
  }

  // 11. Mixed load: six users adding, saving, reordering and deleting pages of one notebook.
  const n11 = await notebook(`${stamp} mixed`);
  for (let i = 0; i < 5; i++) await addPage(n11.NoteId, `Seed ${i}`);
  const worker = async (w) => {
    const seen = [];
    for (let i = 0; i < 15; i++) {
      const live = await pages(n11.NoteId);
      const pick = live[(w * 7 + i) % Math.max(live.length, 1)];
      const actor = USERS[w % USERS.length];
      const op = live.length === 0 ? 0 : (w + i) % 4;
      const run = [
        () => addPage(n11.NoteId, `W${w}-${i}`, actor),
        () => savePage(pick, `w${w}-${i}`, actor),
        () => reorderAll(n11.NoteId, live, actor),
        () => deletePage(pick),
      ][op];
      seen.push(await codeOf(run));
    }
    return seen;
  };
  const r11 = (await Promise.all(Array.from({ length: 6 }, (_, w) => worker(w)))).flat();
  ok(among(r11, "ok", 50001, 50002, 50004), `mixed load ends in valid outcomes only, no deadlock (${[...new Set(r11)]})`);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
