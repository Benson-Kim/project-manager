# ADR-0075: Local Folder Links in Rich Text

- Status: Accepted (USER approved 2026-11-27)
- Date: 2026-11-27
- Modules: `rich-text` (lib + components), `electron`
- Amends: ADR-0025 (link rule)

## 1. Context

Users keep project files in local folders and want a note to point at one, for example
`C:\Users\...\CIUSS Pilot 2025`. ADR-0025 allows only http, https and mailto links, so the Link
dialog refuses a folder path. A folder link must not become a way to run a program or to reach
another machine.

## 2. Decision

1. **Storage.** A folder link is stored as `<a data-local-path="C:\...">text</a>` with no `href`.
   It is never a `file:` URL, so a browser never follows it and the ADR-0025 href rule is unchanged.
2. **One path rule** (`src/lib/rich-text/links.ts`, `localPathProblem`) is shared by the dialog,
   the editor schema and the server sanitiser. A path is kept only when it:
   - starts with a drive letter and a slash (`C:\` or `C:/`), and is at most 260 characters
   - has no control characters and none of `< > " | ? * :` after the drive
   - has no `.` or `..` segment (no traversal)
   - does not end in a blocked extension, read after Windows drops trailing dots and spaces:
     .exe .bat .cmd .com .ps1 .msi .msp .lnk .vbs .vbe .js .jse .wsf .wsh .scr .pif .reg .hta
     .cpl .jar .msc .sh
3. **UNC shares are refused** (`\\host\share`, `//host/share`). Opening one makes Windows send the
   user's credentials to that host. A mapped drive letter still works.
4. **Sanitiser.** `data-local-path` is kept only on an `<a>` with no `href` whose value passes the
   rule; any other link becomes plain text. Event handlers and styles are stripped as before.
5. **Desktop.** An `openLocalPath` IPC asks the main process to open the path. The main process
   checks it again with the same rule, then checks that it exists and is a folder, and only then
   calls `shell.openPath`. It returns a structured result: opened, "Folder not found on this PC",
   or refused. It never calls `shell.openExternal` with a path and never starts a program.
6. **Web build** (no `window.desktop`). A browser cannot open a local folder, so the link shows the
   path as text with a "Copy path" button and a confirmation toast.

## 3. Consequences

- Folder links are only as portable as the path: another PC shows "Folder not found on this PC".
- The executable list is a blocklist; the folder-only check in the main process is the real
  guard, because it refuses any file, whatever its extension.
- Tests: `src/lib/tests/rich-text-local-path.test.ts` (rule + sanitiser), `electron/tests/` (main
  process check), `e2e/local-folder-links.spec.ts`.
- A folder whose name ends in a blocked extension (for example "Next.js") is refused.
- A mapped drive letter passes the drive check, so a link can reach a network share the user has
  mapped.
