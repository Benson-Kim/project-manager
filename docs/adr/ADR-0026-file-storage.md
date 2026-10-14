# ADR-0026 — File storage: attachments any module can reuse

Status: Accepted · Date: 2026-10-10 · Session: file-storage (F1)
Amends ADR-0012 (registers 50006 `QUOTA_EXCEEDED`) and ADR-0003 (an action's
permission may depend on its parsed input).

## Context

Checklist rows 43–44 (module #16, part 1): records need attached files, and a
place to say where a file lives when it is not uploaded. In Access this was
`tblDailyActivityList.Attachment`. Its bytes were never extracted, so there is
nothing to migrate. Daily activities are the first consumer; Financials (FI1)
is next.

Constraints found on develop (2026-10-10):

- **No bytes through SQL.** `ProcParams` (`src/lib/db.ts`) carries no Buffer.
  SQL Server Express also caps a database at 10 GB, and the desktop backs the
  database up daily.
- **Uploads can't use Server Actions.** They have a 1 MB body default, and
  `action()` zod-parses FormData, which rejects a File value.
- **The proxy buffers bodies.** `src/proxy.ts` matches `/api/*`, and Next 16
  buffers every proxied request body up to `proxyClientMaxBodySize` (10 MB).
- **Project-less owners.** Daily activities may have no project (migration
  014), so an attachment's project can be NULL.
- **Desktop.** The Next server runs as the signed-in Windows user, and
  `%ProgramData%\Project Manager` is read-only for Users.
  - Without wiring, `UPLOADS_DIR` would default into the install folder, which
    every update replaces.
  - Desktop installs are per user, so two Windows users on one PC may briefly
    run different app versions against the same machine-wide database.

## Decision

### 1. Owner-scoped attachments (user decision 2026-10-10)

- **Shared table.** `app.FileAttachment` (migration 022) holds one attachment
  and has no owner columns:
  - `FileName`: the display name, which is also the download name and can be
    renamed;
  - for an uploaded file: `ContentType` (sniffed), `SizeBytes`, `Sha256` and
    `StoragePath`;
  - for a location reference: `StorageLocation` NVARCHAR(500);
  - `ProjectId`, copied from the owner and used for the quota;
  - the standard audit and soft-delete columns, plus `RowVer`.
- **One link table per consumer.** Daily activities use
  `app.DailyActivityFile (DailyActivityId, FileAttachmentId)`, with real FKs.
  An attachment belongs to exactly one owner (unique `FileAttachmentId`).
- **Procs live in the owner's folder** and use the owner's access helper and
  permission:
  - `db/procs/daily-activity/usp_DailyActivity_{CanAddFile, AddFile,
    ListFiles, GetFile, RenameFile, RemoveFile}`;
  - reading (list, download) needs `daily-activities:read` (Viewer);
  - adding, renaming and removing need `daily-activities:update`
    (Contributor), since in Access the attachment was a field of the record;
  - per-person overrides (ADR-0024) and the Contributor rules therefore follow
    the section with no extra work;
  - `src/tests/proc-access-levels.test.ts` maps the new suffixes in `VERBS`.
- **Rejected alternative: polymorphic** (`EntityName/EntityId` plus a separate
  "files" permission module). It has no FK, and a Manager who revokes
  `daily-activities:update` would also have to revoke `files:*`.
- **Owner registry.** The app keeps one registry
  (`src/modules/file-storage/repository/owners.ts`) mapping an owner key
  (`daily-activity`) to its procs, id parameter and permissions. A consumer
  adds a link table, its procs, the key in `ATTACHMENT_OWNERS` and one
  registry entry; `owners.test.ts` checks the procs exist and that the access
  guardrail covers their folder.
- **Where the code lives.**
  - `src/lib/files/` (server only): storage, sniffing, the AV hook, the sweep
    and HTTP helpers.
  - `src/lib/file-names.ts` (pure, client-safe): name cleaning and
    `Content-Disposition`.
  - `src/modules/file-storage/`: schemas, the repository, the actions and the
    route-handler logic. `src/tests/file-storage-boundaries.test.ts` keeps the
    server-only parts and every `node:` built-in out of client modules.

### 2. Removing an attachment needs `<owner>:update` (user decision 2026-10-10)

Contributors may remove an attachment, because that edits the record. Removal
is a soft delete. Deleting the owner (`usp_DailyActivity_Delete`) soft-deletes
its attachments in the same transaction. Moving an activity to another project
(`usp_DailyActivity_Update`) moves its attachments' `ProjectId` too.

### 3. Transport: a raw-body POST, streamed, with no new dependency

- **Request.** The client POSTs the file itself as the request body with
  XMLHttpRequest, which gives upload progress. The owner, the owner id and the
  file name travel in the query string:
  `POST /api/files?owner=daily-activity&ownerId=12&name=…`.
- **Checks, in order.** The first two are `fileRoute`'s (see "Proxy"); the
  rest are the handler's:
  1. a same-origin request (`Sec-Fetch-Site`, then `Origin` against the host),
     for any method but GET and HEAD;
  2. a session, refusing one that must still change its password, because the
     proxy is bypassed (see below);
  3. the owner key from the whitelist;
  4. `Content-Length` no larger than the cap;
  5. **`usp_<Owner>_CanAddFile`, before any byte is read.** A person who may
     not add files never gets to upload 25 MB, and the quota is checked early.
- **Streaming.** The handler streams `request.body` to a temp file while
  computing SHA-256 and counting bytes. It aborts above **25 MB** (413). It then
  sniffs the type, runs the AV hook and renames the file to
  `<UPLOADS_DIR>/<hash 0–1>/<hash 2–3>/<hash>`.
  - The temp folder is `<UPLOADS_DIR>/.tmp`, so the rename stays on one volume.
- **Proxy.** `/api/files` is excluded from the proxy matcher, so bodies stream
  and no 10 MB limit applies. `src/tests/proxy-matcher.test.ts` compiles the
  matcher with Next's own function and pins that only `/api/files` and
  `/api/files/…` are skipped.
  - **The gate lives in one place** (amended 2026-10-11). Every method a route
    file under `src/app/api/files` exports is
    `fileRoute(handler)` (`src/modules/file-storage/handlers/file-route.ts`).
    It applies checks 1 and 2, then calls the handler with the session.
  - `src/tests/file-storage-boundaries.test.ts` fails a route file there that
    exports a plain function, an arrow function, a re-export, or a `fileRoute`
    not imported from that module.
  - Reason: the skip covers the whole prefix. A later route (a preview, a
    zip) written as a plain handler would serve files by sequential id to
    anyone.
  - Raising `proxyClientMaxBodySize` to 26 MB was rejected: it buffers every
    proxied body up to that size.
- **Download.** `GET /api/files/<id>?owner=daily-activity`:
  - needs a session and the owner's read check;
  - reads from `storedFilesRoot()`, which neither creates the folder nor needs
    it writable, and still answers when uploads are off. Files stored earlier
    stay downloadable with `UPLOADS_ENABLED=false` or a read-only volume
    (amended 2026-10-14: `uploadsRoot()` made every such download a 404);
  - NOT_FOUND and FORBIDDEN_ROW both answer 404, like `orNotFound`;
  - the stored file must be the row's size (else 404) and hash to its SHA-256.
    `verifySha256` holds the last chunk back until the hash is known, so wrong
    bytes never arrive complete; the download fails instead. The bytes can
    change on disk: desktop users can write the Uploads folder (§9), and disks
    and scanners damage files (added 2026-10-11). The desktop shell has no
    download bar, so it tells the user when a download is refused or cut off
    (`watchDownloads()` in `electron/main.ts`);
  - it streams the file with `Content-Disposition: attachment` (an ASCII
    fallback plus `filename*=UTF-8''…`), `X-Content-Type-Options: nosniff`,
    `Cache-Control: no-store` and a `default-src 'none'; sandbox` CSP.
- **Mutations without bytes** (rename, remove, add a location) go through
  `action()`. Their permission comes from the owner in the parsed input, so
  `action()` now also accepts `permission: (input) => Permission`.

### 4. Allowed types, by magic bytes (STANDARDS §4)

The extension must agree with the sniffed type, and anything else is refused
(415). There is no new dependency.

| Type | Extensions | Rule |
|---|---|---|
| PDF | `.pdf` | starts with `%PDF-` |
| PNG | `.png` | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `.jpg`, `.jpeg` | `FF D8 FF` |
| Word, Excel, PowerPoint | `.docx`, `.xlsx`, `.pptx` | ZIP `PK 03 04` whose central directory has `word/`, `xl/` or `ppt/` entries and no `vbaProject.bin`; any other ZIP is refused |
| Outlook message | `.msg` | OLE CFB `D0 CF 11 E0 A1 B1 1A E1` |
| Text, CSV | `.txt`, `.csv` | valid UTF-8 (BOM allowed) with no NUL byte |
| E-mail | `.eml` | as text, and the first line is a header field (`Name: value`) |

- **File names.** Path separators, control characters and `<>:"|?*` are
  stripped. The name is capped at 255 characters, keeping the extension.
- **AV scan.** `scanFile()` is a stub that always passes, the single place
  where a scanner plugs in.

### 5. Dedupe, deletion and the orphan sweep

- **Dedupe.** The same hash reuses the stored bytes, with one row per upload.
  - The stored file is reused only when it is the upload's size; otherwise
    the upload replaces it.
  - Reuse sets the file's modification time to now. Without that, a re-upload
    of an orphan older than the grace period could be deleted by a sweep that
    read its retained hashes just before the new row existed (added
    2026-10-11).
- **Sweep.** `sweepOrphanFiles()` (`src/lib/files/sweep.ts`) asks
  `usp_FileAttachment_ListRetained` (Admin only) for the hashes that a live
  row, or a row deleted within the grace period (30 days), still references.
  It deletes:
  - stored files that no retained row references and that are older than the
    grace period;
  - temp files left by aborted uploads.
- **A reuse during a sweep** (amended 2026-10-14). The sweep reads a file's
  age, then deletes it; a reuse could touch the file
  and record its row in between, and lose its bytes. A file judged old is now
  renamed aside (`<hash>.<uuid>.sweep`) and its age read again: a reuse that
  touched it first is seen and the file goes back; one that comes later finds
  it gone and stores its own copy. An aside file left by a stopped sweep is put
  back by the next one. This holds across processes, so it stays correct when
  F2 schedules the sweep elsewhere.
- An Admin-only action runs the sweep. **Scheduling it is F2's.**
- A restore older than the grace period gets its rows back, but their bytes may
  be gone.

### 6. Quota per project, and a free-space floor

- **The quota is a fair share per project, not a disk guard** (amended
  2026-10-11).
  - It counts live rows only, so removing a file frees quota at once while its
    bytes stay on disk until the sweep (§5).
  - Any User can create a project and so get a fresh quota.
  - Moving an activity to another project does not check that project's
    quota.
- **The floor is the disk guard.** Before reading a byte, the handler refuses
  an upload (507, its own message) that would leave less than
  `UPLOADS_MIN_FREE_MB` (default 2048; 0 turns it off) free on the uploads
  disk (`fs.statfs`). It counts the declared size, or 25 MB for a body without
  `Content-Length`. On the desktop that disk also holds SQL Server's files and
  backups, so a full disk would stop the database, not just uploads.
  - **Parallel uploads** (amended 2026-10-14). They all read the same free
    space before any writes, so each one that passes
    reserves its size until it is stored or dropped, and the next one counts
    the reservations against the floor. Bytes already written are then counted
    twice, which errs on the side of refusing. The reservations live in the
    server process, the only one that writes the folder (one per Docker
    container or desktop install).
- **Size.** `UPLOADS_QUOTA_MB_PER_PROJECT`, default 2048. Project-less rows
  share one bucket.
- **What counts.** Uploaded bytes per row, so a deduplicated file still counts,
  as the user sees it. Locations count nothing.
- **Enforcement.** `usp_<Owner>_AddFile` is authoritative: it sums the bucket
  under an exclusive app lock (`sp_getapplock` on `file-quota:<project|none>`),
  so two parallel uploads cannot both slip under the limit.
  - **The bucket is read under a lock on the owner** (amended 2026-10-14).
    AddFile opens its transaction first, reads the live owner
    `WITH (UPDLOCK, HOLDLOCK)` and checks access once, under that lock.
    Before, it read the owner's project outside the transaction: a move in
    between charged the file to the old project, and a delete left a live,
    quota-consuming attachment on a deleted owner. A move or delete now waits
    for COMMIT (verified locally with two sessions: the move hit its 1 s lock
    timeout while the attachment transaction was open). The lock order (owner
    row, quota lock, attachment rows) matches `usp_DailyActivity_Update` and
    `_Delete`. Measured on 66,000 attachment rows: 74 logical reads per call,
    the same as before.
- **Pre-check.** The handler checks early with `CanAddFile` and
  `Content-Length`.
- **Error.** The new code **50006 `QUOTA_EXCEEDED`** (registered in ADR-0012).
  It has its own message; `VALIDATION` would show the generic "Check the
  highlighted fields".

### 7. Locations (row 44)

- **Shape.** A location row has a name and a `StorageLocation` (a SharePoint
  URL, a network path, a drawer…) and no bytes. A CHECK constraint allows
  exactly one kind per row: a file or a location.
- **Display.** An `http(s)` location renders as a link
  (`rel="noopener noreferrer"`). Anything else renders as text with a copy
  button.

### 8. Configuration and the server edition

- `src/lib/env.ts` gains:
  - `UPLOADS_DIR`: absolute; default `<cwd>/uploads`; created and checked
    writable on first use, not at build;
  - `UPLOADS_QUOTA_MB_PER_PROJECT`;
  - `UPLOADS_MIN_FREE_MB` (§6);
  - `UPLOADS_ENABLED`: only an explicit `false` switches uploads off (§9).
    Uploads then answer 503 with their own message, the sweep has nothing to
    do, and `UPLOADS_DIR` is never touched.
- `docker-compose.yml` sets `UPLOADS_DIR=/app/uploads` on the existing volume.
- The `Dockerfile` creates `/app/uploads`, owned by `nextjs`, before
  `USER nextjs`, so the named volume is writable.
- `scripts/backup.sh` already tars `UPLOADS_DIR`. Its upload target is F2's.

### 9. Desktop: one machine-wide folder (user decision 2026-10-10)

- **Folder.** `%ProgramData%\Project Manager\Uploads`, created by
  `provision.ps1` with `Users:(OI)(CI)M`, the same grant as `Backups`. The
  records are shared by every Windows user on the PC, so their files must be
  too.
- **machine.json gains `uploadsDir`, and `schemaVersion` stays 1.**
- **A PC provisioned before F1 has no `uploadsDir`, and this never blocks the
  app** (amended 2026-10-11).
  - Only an administrator can create the folder, and the client's staff run as
    standard Windows users (user, 2026-10-11).
  - The app starts with uploads off: `electron/next-server.ts` sets
    `UPLOADS_ENABLED=false` and never lets the server fall back to
    `<cwd>/uploads`.
  - Locations, downloads, rename and remove still work. Attachments shows that
    IT can turn uploads on.
  - Each Windows user is offered the setup once at start-up ("Set up now" /
    "Later"). The tray keeps "Set up attachments (administrator)…" until it is
    done; after it, the app restarts to use the folder.
  - IT can also run `provision.ps1` elevated, remotely (docs/DESKTOP.md).
  - The first version made `uploadsDir` required: a missing one raised
    `SetupRequiredError` and the blocking Repair dialog. **Rejected after review
    (2026-10-11).** Every green push to develop auto-updates installed PCs, so
    every standard user would have been locked out of the whole app until IT
    visited their PC.
  - The prompt suggested schemaVersion 2. That was rejected: installs are per
    user, so a 1.0.x app on the same PC would reject version 2. Its Repair would
    run the old `provision.ps1`, which writes version 1 again, and the two apps
    would trade administrator prompts. An extra field is ignored by 1.0.x apps.
- **Server env.** `electron/next-server.ts` passes `UPLOADS_DIR`.
- **Backups.** After each backup, `electron/backup.ts` mirrors new files into
  `<copy folder>\Uploads`. Hash names never change, so only missing files are
  copied, and a failed mirror is reported like a failed copy.
  - **Unreadable folders and damaged files fail the copy** (amended
    2026-10-14). The mirror used to read any folder it could not list
    (missing, access denied, I/O error) as empty, so a backup
    reported success with no attachments. A folder that cannot be read now
    throws; the Uploads folder is created by provisioning, so its absence is
    an error too. Each copied file is hashed before it is kept, and a source
    whose bytes no longer match its name is not copied and is named in the
    copy error.
- **Restore** (added 2026-10-11). After the database, *Restore from backup…*
  copies back every file the Uploads folder lacks. It looks in `Uploads` next
  to the chosen `.bak`, then in `<copy folder>\Uploads`.
  - It also replaces a file the Uploads folder holds damaged (its bytes no
    longer hash to its name), which is what downloads tell desktop users to
    restore for (amended 2026-10-14). It used to skip any file that existed
    and report "no attachment files were missing". A file that no source has
    intact is counted in the final message.
  - Before this, the records came back with every download answering 404,
    while the bytes sat unused in the copy folder.
  - A copy failure never fails the restore; the final message says what to
    copy by hand.
- **Rejected alternatives:**
  - a per-user folder: another Windows user could not open the files;
  - `C:\Users\Public\Documents`: it needs no prompt, but it is visible and
    deletable in Explorer and is often redirected.

### 10. UI

`<Attachments owner ownerId files canAdd canRemove />` lives in
`src/components/ui/attachments/`. It provides:

- a list showing name, size, date and who;
- upload with a progress bar, by button or drag-and-drop;
- download, rename, remove (ConfirmDialog) and add-a-location.

Inside a record's sheet it sits in the record's `<form>`, under these rules:

- the file input has **no name**, so the record's FormData never carries a File;
- change, input and blur events stop at the component, so uploads never mark
  the record dirty or run its blur validation;
- its dialogs contain **no `<form>`**, because React events bubble through
  portals (LESSONS §21);
- it shows for saved records only;
- in a disabled fieldset it is read-only, but downloads still work.

The list loads server-side with the record (`usp_<Owner>_ListFiles`) and
refreshes with `router.refresh()`. The client never fetches it.

## Consequences

- A consumer adds a link table, six small procs, one registry entry and the
  `<Attachments>` element.
- Attachment bytes live outside SQL Server:
  - the server edition backs them up with `scripts/backup.sh`;
  - the desktop mirrors them next to its database copies.
- `/api/files` has no proxy CSP, so its handlers set their own headers. Any
  other route stays behind the proxy (pinned by test).
- PCs installed before F1 have no file uploads until an administrator approves
  the one-time setup. Nothing else waits for it.
- **Desktop rule:** a change that needs an administrator turns its feature off
  until IT acts. It never blocks start-up.
- Open for F2: scheduling the sweep, restoring files on the server edition,
  and moving `scripts/backup.sh` off GitLab.
