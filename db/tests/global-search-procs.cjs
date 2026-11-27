// Behaviour checks for global search (ADR-0073): usp_Search_Global and the widened
// search columns on usp_Stakeholder_List and usp_Supplier_List. Covers BOLA / cross-project
// isolation, Viewer access, deactivated & unknown actors, soft-deleted project & child exclusion,
// projectless keywords (@AllowProjectless = 1), widened columns + NULL LastName parity across
// global and list procs, LIKE metacharacter escaping + 100-char non-truncation, @Kinds allowlist
// (including empty tokens from trailing/double commas), per-kind TopPerKind no-starvation, and
// ranking order. Runs as pm_web (EXECUTE-only) against ProjectManager_t1028 or CI ProjectManager.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");

const ADMIN = 1;
const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}

async function one(proc, params) {
  const [[row]] = await exec(proc, params);
  return row;
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

const searchGlobal = (actor, search, kinds = null, topPerKind = 25) =>
  exec("usp_Search_Global", {
    ActorUserId: actor,
    Search: search,
    Kinds: kinds,
    TopPerKind: topPerKind,
  }).then((sets) => sets[0] || []);

const createProject = (name, actor = PM) =>
  one("usp_Project_Create", {
    ProjectName: name,
    A1: 0,
    DA: 0,
    DAS: 0,
    DO: 0,
    PurchaseEquipment: 0,
    SimilarProject: 0,
    ActorUserId: actor,
  });

const createKeyword = (projectId, keyword, definition = null, actor = PM) =>
  one("usp_Keyword_Create", {
    ProjectId: projectId,
    Keyword: keyword,
    Definition: definition,
    ActorUserId: actor,
  });

const createStakeholder = (projectId, first, last, extra = {}, actor = PM) =>
  one("usp_Stakeholder_Create", {
    ProjectId: projectId,
    FirstName: first,
    LastName: last,
    ActorUserId: actor,
    ...extra,
  });

const createSupplier = (projectId, name, extra = {}, actor = PM) =>
  one("usp_Supplier_Create", {
    ProjectId: projectId,
    SupplierName: name,
    ActorUserId: actor,
    ...extra,
  });

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost",
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });

  const stamp = `gs${Date.now().toString(36)}`;
  const createdProjects = [];
  const createdProjectlessKeywords = [];
  let tempUserId = null;

  try {
    // 1. Create isolated projects:
    //    P1: owned by PM, shared with CONTRIB & VIEWER (OUTSIDER has no access).
    //    P2: owned by ADMIN, assigned ONLY to OUTSIDER (PM, CONTRIB, VIEWER have no access).
    //    P_DEL: owned by PM, will be soft-deleted to verify p.IsDeleted = 0 exclusion even for Admin.
    const [roles] = await exec("usp_Role_List", {});
    const USER_ROLE = roles.find((r) => r.Name === "User").RoleId;

    const outsiderRow = await one("usp_User_Create", {
      Username: `${stamp}-outsider`,
      PasswordHash: "placeholder-not-a-hash",
      DisplayName: "Outsider",
      Email: null,
      RoleId: USER_ROLE,
      MustChangePassword: true,
      ActorUserId: ADMIN,
    });
    tempUserId = outsiderRow.UserId;

    const p1 = await createProject(`${stamp} Alpha`, PM);
    createdProjects.push({ id: p1.ProjectId, actor: PM });
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: p1.ProjectId,
      AssigneesJson: JSON.stringify([
        { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
        { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
        { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
      ]),
      ActorUserId: PM,
    });

    const p2 = await createProject(`${stamp} Beta`, ADMIN);
    createdProjects.push({ id: p2.ProjectId, actor: ADMIN });
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: p2.ProjectId,
      AssigneesJson: JSON.stringify([
        { role: "Project manager", personName: "out", userId: tempUserId, accessLevel: "Manager" },
      ]),
      ActorUserId: ADMIN,
    });

    const pDel = await createProject(`${stamp} Deleted`, PM);
    const kwDel = await createKeyword(pDel.ProjectId, `${stamp}_delkw`, `Def ${stamp}`, PM);
    const shDel = await createStakeholder(pDel.ProjectId, `${stamp}Del`, "Person", {}, PM);
    const spDel = await createSupplier(pDel.ProjectId, `${stamp} DelSup`, {}, PM);

    // 2. Seed matching rows in P1, P2, and projectless keyword space.
    const kw1 = await createKeyword(p1.ProjectId, `${stamp}_kw1`, `Shared ${stamp} def`, PM);
    const kw2 = await createKeyword(p2.ProjectId, `${stamp}_kw2`, `Secret ${stamp} def`, ADMIN);
    const kwShared = await createKeyword(null, `${stamp}_shared`, `Global ${stamp} term`, ADMIN);
    createdProjectlessKeywords.push(kwShared);

    const sh1 = await createStakeholder(
      p1.ProjectId,
      `Elena_${stamp}`,
      `Vance_${stamp}`,
      {
        ProjectRole: `Lead Architect ${stamp}`,
        DepartmentOrganization: `Platform ${stamp}`,
        EmailAddress: `elena.${stamp}@p1.test`,
      },
      PM,
    );
    const sh1NullLast = await createStakeholder(
      p1.ProjectId,
      `SoloMinistry_${stamp}`,
      null,
      { ProjectRole: `Advisor ${stamp}` },
      PM,
    );
    const sh2 = await createStakeholder(
      p2.ProjectId,
      `Hidden_${stamp}`,
      `User_${stamp}`,
      { ProjectRole: `SecretRole ${stamp}` },
      ADMIN,
    );

    const sp1 = await createSupplier(
      p1.ProjectId,
      `Acme_${stamp}`,
      {
        ContactPerson: `Sam_${stamp}`,
        EmailAddress: `vendor.${stamp}@acme.test`,
        City: `Montreal_${stamp}`,
        Rating: "Good",
      },
      PM,
    );
    const sp2 = await createSupplier(
      p2.ProjectId,
      `Vault_${stamp}`,
      { EmailAddress: `hidden.${stamp}@vault.test` },
      ADMIN,
    );

    // 3. Actor & input validation.
    await expectCode(50003, "NULL actor rejected", () => searchGlobal(null, stamp));
    await expectCode(50003, "unknown actor rejected", () => searchGlobal(-9999, stamp));
    await expectCode(50004, "NULL search rejected", () => searchGlobal(PM, null));
    await expectCode(50004, "1-char search rejected", () => searchGlobal(PM, "a"));
    await expectCode(50004, "1-char padded search rejected", () => searchGlobal(PM, " a "));
    await expectCode(50004, "unknown @Kinds rejected", () => searchGlobal(PM, stamp, "decision"));
    await expectCode(50004, "trailing comma @Kinds rejected", () =>
      searchGlobal(PM, stamp, "keyword,"),
    );
    await expectCode(50004, "leading comma @Kinds rejected", () =>
      searchGlobal(PM, stamp, ",keyword"),
    );
    await expectCode(50004, "double comma @Kinds rejected", () =>
      searchGlobal(PM, stamp, "keyword,,supplier"),
    );
    await expectCode(50004, "only comma @Kinds rejected", () => searchGlobal(PM, stamp, ","));
    await expectCode(50004, "spaces around comma @Kinds rejected", () =>
      searchGlobal(PM, stamp, " , "),
    );

    // 4. BOLA / cross-project isolation + Viewer + Admin + projectless keyword.
    const viewerHits = await searchGlobal(VIEWER, stamp);
    ok(
      viewerHits.some((r) => r.Kind === "keyword" && r.Id === kw1.KeywordId && r.ProjectId === p1.ProjectId),
      "Viewer sees P1 keyword",
    );
    ok(
      viewerHits.some((r) => r.Kind === "keyword" && r.Id === kwShared.KeywordId && r.ProjectId === null && r.ProjectName === null),
      "Viewer sees projectless keyword with NULL project fields",
    );
    ok(
      viewerHits.some((r) => r.Kind === "stakeholder" && r.Id === sh1.StakeholderId),
      "Viewer sees P1 stakeholder",
    );
    ok(
      viewerHits.some((r) => r.Kind === "supplier" && r.Id === sp1.SupplierId),
      "Viewer sees P1 supplier",
    );
    ok(
      !viewerHits.some((r) => r.ProjectId === p2.ProjectId || r.Id === kw2.KeywordId || r.Id === sh2.StakeholderId || r.Id === sp2.SupplierId),
      "Viewer never sees P2 records",
    );

    const contribHits = await searchGlobal(CONTRIB, stamp);
    ok(
      contribHits.some((r) => r.Kind === "keyword" && r.Id === kw1.KeywordId) &&
        !contribHits.some((r) => r.ProjectId === p2.ProjectId),
      "Contributor sees P1 and zero P2 records",
    );

    const outsiderHits = await searchGlobal(tempUserId, stamp);
    ok(
      outsiderHits.some((r) => r.Kind === "keyword" && r.Id === kw2.KeywordId) &&
        outsiderHits.some((r) => r.Kind === "stakeholder" && r.Id === sh2.StakeholderId) &&
        outsiderHits.some((r) => r.Kind === "supplier" && r.Id === sp2.SupplierId) &&
        outsiderHits.some((r) => r.Kind === "keyword" && r.Id === kwShared.KeywordId) &&
        !outsiderHits.some((r) => r.ProjectId === p1.ProjectId),
      "Outsider sees P2 + projectless keyword and zero P1 records",
    );

    const adminHits = await searchGlobal(ADMIN, stamp);
    ok(
      adminHits.some((r) => r.ProjectId === p1.ProjectId) &&
        adminHits.some((r) => r.ProjectId === p2.ProjectId) &&
        adminHits.some((r) => r.ProjectId === pDel.ProjectId),
      "Admin sees all active projects before soft-delete",
    );

    // 5. Soft-deleted project excludes active child records even for Admin.
    await exec("usp_Project_Delete", { ProjectId: pDel.ProjectId, RowVer: pDel.RowVer, ActorUserId: PM });
    const adminAfterProjDelete = await searchGlobal(ADMIN, stamp);
    ok(
      !adminAfterProjDelete.some(
        (r) =>
          r.ProjectId === pDel.ProjectId ||
          (r.Kind === "keyword" && r.Id === kwDel.KeywordId) ||
          (r.Kind === "stakeholder" && r.Id === shDel.StakeholderId) ||
          (r.Kind === "supplier" && r.Id === spDel.SupplierId),
      ),
      "Soft-deleted project hides all active child records even for Admin",
    );

    // 6. Soft-deleted individual child records are excluded immediately.
    const kwTmp = await createKeyword(p1.ProjectId, `${stamp}_tmpdel`, null, PM);
    ok(
      (await searchGlobal(PM, `${stamp}_tmpdel`)).length === 1,
      "Newly created keyword appears before delete",
    );
    await exec("usp_Keyword_Delete", { KeywordId: kwTmp.KeywordId, RowVer: kwTmp.RowVer, ActorUserId: PM });
    ok(
      (await searchGlobal(PM, `${stamp}_tmpdel`)).length === 0,
      "Soft-deleted keyword is excluded",
    );

    // 7. Widened columns & NULL LastName handling + parity with list procs.
    const fullNameTerm = `Elena_${stamp} Vance_${stamp}`;
    const gFull = await searchGlobal(PM, fullNameTerm);
    const lFull = (
      await exec("usp_Stakeholder_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: fullNameTerm,
      })
    )[0];
    ok(
      gFull.some((r) => r.Kind === "stakeholder" && r.Id === sh1.StakeholderId && r.Title === fullNameTerm) &&
        lFull.some((r) => r.StakeholderId === sh1.StakeholderId),
      "Full-name phrase matches in both usp_Search_Global and usp_Stakeholder_List",
    );

    const roleTerm = `Lead Architect ${stamp}`;
    const gRole = await searchGlobal(PM, roleTerm);
    const lRole = (
      await exec("usp_Stakeholder_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: roleTerm,
      })
    )[0];
    ok(
      gRole.some((r) => r.Kind === "stakeholder" && r.Id === sh1.StakeholderId) &&
        lRole.some((r) => r.StakeholderId === sh1.StakeholderId),
      "ProjectRole matches in both usp_Search_Global and usp_Stakeholder_List",
    );

    const nullLastTerm = `SoloMinistry_${stamp}`;
    const gNullLast = await searchGlobal(PM, nullLastTerm);
    const lNullLast = (
      await exec("usp_Stakeholder_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: nullLastTerm,
      })
    )[0];
    const nullLastHit = gNullLast.find((r) => r.Kind === "stakeholder" && r.Id === sh1NullLast.StakeholderId);
    ok(
      Boolean(nullLastHit && nullLastHit.Title === nullLastTerm) &&
        lNullLast.some((r) => r.StakeholderId === sh1NullLast.StakeholderId),
      "NULL LastName CONCAT produces exact FirstName without trailing space and matches list proc",
    );

    const emailTerm = `vendor.${stamp}@acme.test`;
    const gEmail = await searchGlobal(PM, emailTerm);
    const lEmail = (
      await exec("usp_Supplier_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: emailTerm,
      })
    )[0];
    const supHit = gEmail.find((r) => r.Kind === "supplier" && r.Id === sp1.SupplierId);
    ok(
      Boolean(
        supHit &&
          supHit.Snippet === `Sam_${stamp} · Montreal_${stamp} · Good`,
      ) && lEmail.some((r) => r.SupplierId === sp1.SupplierId),
      "Supplier EmailAddress matches in both usp_Search_Global and usp_Supplier_List with middle-dot snippet",
    );

    // 8. LIKE metacharacters escaped literally + 100-char metacharacter input does not truncate/fail.
    await createKeyword(p1.ProjectId, `50% rate_a [tier1]\\x ${stamp}`, null, PM);
    await createKeyword(p1.ProjectId, `500 rateXa tier1x ${stamp}`, null, PM);
    const pctHits = await searchGlobal(PM, `50% rate_a`);
    ok(
      pctHits.length === 1 && pctHits[0].Title.includes("50% rate_a"),
      "LIKE wildcards % and _ match literally",
    );
    const bracketHits = await searchGlobal(PM, `[tier1]\\x`);
    ok(
      bracketHits.length === 1 && bracketHits[0].Title.includes("[tier1]\\x"),
      "LIKE metacharacters [ and \\ match literally",
    );

    const hundredWildcards = "%".repeat(100);
    const wildGlobal = await searchGlobal(PM, hundredWildcards);
    const wildSh = (
      await exec("usp_Stakeholder_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: hundredWildcards,
      })
    )[0];
    const wildSp = (
      await exec("usp_Supplier_List", {
        ActorUserId: PM,
        ProjectId: p1.ProjectId,
        Search: hundredWildcards,
      })
    )[0];
    ok(
      Array.isArray(wildGlobal) && Array.isArray(wildSh) && Array.isArray(wildSp),
      "100 metacharacters execute cleanly without NVARCHAR truncation or ESCAPE syntax errors",
    );

    // 9. Per-kind TopPerKind cap prevents one kind starving another, and @Kinds filters cleanly.
    const capStamp = `cap${stamp}`;
    await createKeyword(p1.ProjectId, `${capStamp}_sub`, null, PM);
    await createKeyword(p1.ProjectId, `${capStamp}_b`, null, PM);
    await createKeyword(p1.ProjectId, `${capStamp}_c`, null, PM);
    await createKeyword(p1.ProjectId, `${capStamp}`, null, PM); // exact match
    await createSupplier(p1.ProjectId, `${capStamp}_sup`, {}, PM);

    const capped = await searchGlobal(PM, capStamp, "   ", 2);
    const kwCapped = capped.filter((r) => r.Kind === "keyword");
    const spCapped = capped.filter((r) => r.Kind === "supplier");
    ok(
      kwCapped.length === 2 && spCapped.length === 1,
      `Per-kind TOP(2) caps keywords without starving suppliers (kw=${kwCapped.length}, sp=${spCapped.length})`,
    );
    ok(kwCapped[0].Title === capStamp, "Exact primary-field match ranks first");

    const supOnly = await searchGlobal(PM, capStamp, " SUPPLIER , Supplier ");
    ok(
      supOnly.length === 1 && supOnly[0].Kind === "supplier",
      "@Kinds case-insensitive allowlist restricts results to requested kind(s)",
    );

    // 10. Deactivated actor is rejected immediately.
    const outLatest = await one("usp_User_GetById", { UserId: tempUserId, ActorUserId: ADMIN });
    await exec("usp_User_Deactivate", {
      UserId: tempUserId,
      RowVer: outLatest.RowVer,
      ActorUserId: ADMIN,
    });
    tempUserId = null;
    await expectCode(50003, "deactivated actor rejected", () =>
      searchGlobal(outLatest.UserId, stamp),
    );
  } finally {
    // Cleanup throwaway records so ProjectManager_t1028 stays clean.
    for (const kw of createdProjectlessKeywords) {
      try {
        await exec("usp_Keyword_Delete", {
          KeywordId: kw.KeywordId,
          RowVer: kw.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    for (const p of createdProjects) {
      try {
        const current = await one("usp_Project_GetById", {
          ProjectId: p.id,
          ActorUserId: p.actor,
        });
        await exec("usp_Project_Delete", {
          ProjectId: p.id,
          RowVer: current.RowVer,
          ActorUserId: p.actor,
        });
      } catch {}
    }
    if (tempUserId !== null) {
      try {
        const u = await one("usp_User_GetById", { UserId: tempUserId, ActorUserId: ADMIN });
        await exec("usp_User_Deactivate", {
          UserId: tempUserId,
          RowVer: u.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    if (pool) await pool.close();
  }

  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
