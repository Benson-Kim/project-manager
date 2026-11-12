// .env names the real database and only fills values the environment lacks, so DB_NAME must be
// set in the environment itself. CI sets ProjectManager in its own throwaway container.
if (!process.env.DB_NAME || (process.env.DB_NAME === "ProjectManager" && !process.env.CI)) {
  console.error("Set DB_NAME to a test database (e.g. ProjectManager_t1028): ProjectManager is the real one.");
  process.exit(1);
}
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
