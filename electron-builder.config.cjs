// electron-builder configuration for the Windows desktop edition.
// Run through scripts/desktop/build.mjs (npm run electron:build), which stages
// build/desktop-app first and runs electron-builder with that folder as its
// project directory — never call electron-builder directly.
//
// Why a staged project dir: electron-builder packs the project's production
// dependencies into app.asar. The staged package.json has none (the main
// process is a single esbuild bundle and the Next server carries its own
// node_modules), so nothing from the repo's node_modules can leak in.
//
// Build-time environment:
//   PM_VERSION        — app version (CI sets it per release; default: package.json).
//   PM_UPDATE_GITHUB  — owner/repo whose GitHub Releases are the update feed
//                       (default: this repo; CI publishes there, see docs/DESKTOP.md).
//   PM_UPDATE_URL     — alternative feed: a static HTTPS folder with latest.yml + installer.
//   PM_UPDATE_FEED=off — build without a feed (auto-update disabled).
//   CSC_LINK / CSC_KEY_PASSWORD — code-signing certificate (removes the SmartScreen warning).

const path = require("path");

const root = __dirname;
const r = (...p) => path.join(root, ...p);
const DEFAULT_UPDATE_REPO = "Benson-Kim/project-manager";

function updateFeed(env) {
  if (env.PM_UPDATE_FEED === "off") return null;
  if (env.PM_UPDATE_URL) return [{ provider: "generic", url: env.PM_UPDATE_URL }];
  const [owner, repo] = (env.PM_UPDATE_GITHUB || DEFAULT_UPDATE_REPO).split("/");
  if (!owner || !repo) throw new Error("PM_UPDATE_GITHUB must look like owner/repo");
  return [{ provider: "github", owner, repo, releaseType: "release" }];
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.burton.projectmanager",
  productName: "Project Manager",
  copyright: "Copyright © 2026 Burton",
  electronVersion: require("./node_modules/electron/package.json").version,

  directories: {
    output: r("dist-installer"),
    buildResources: r("build-resources"),
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  asar: true,
  electronLanguages: ["en-US"],
  files: ["main.js", "splash.html", "splash-logo.png", "package.json"],

  extraResources: [
    { from: r("db"), to: "db", filter: ["migrations/*.sql", "procs/**/*.sql", "seed/*.sql"] },
    {
      from: r("electron", "setup"),
      to: "setup",
      filter: ["provision.ps1", "remove-all-users-install.ps1"],
    },
    { from: r("installers", "sql-express"), to: "sql-express", filter: ["SQLEXPR_x64_ENU.exe"] },
    { from: r("build-resources", "icon.ico"), to: "icon.ico" },
  ],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: r("build-resources", "icon.ico"),
    artifactName: "ProjectManager-Setup-${version}.${ext}",
    // Keep Microsoft's signature on the SQL Server media: provision.ps1 refuses
    // to run an installer that isn't Microsoft-signed.
    signExts: ["!SQLEXPR_x64_ENU.exe"],
  },

  nsis: {
    oneClick: false,
    // Per user (%LOCALAPPDATA%\Programs), forced in installer.nsh
    // (customInstallMode): installing and updating need no administrator
    // rights. Only the one-time database engine setup asks for approval.
    perMachine: false,
    // A fixed, user-writable location: a folder like Program Files would need
    // administrator rights for every update.
    allowToChangeInstallationDirectory: false,
    installerIcon: r("build-resources", "icon.ico"),
    uninstallerIcon: r("build-resources", "icon.ico"),
    // Logo on the wizard: header (every page, including "Installing") and the
    // finish/uninstall side panel. 24-bit BMPs generated from icon.png.
    installerHeader: r("build-resources", "installerHeader.bmp"),
    installerSidebar: r("build-resources", "installerSidebar.bmp"),
    uninstallerSidebar: r("build-resources", "installerSidebar.bmp"),
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: "Project Manager",
    deleteAppDataOnUninstall: false,
    include: r("build-resources", "installer.nsh"),
  },

  // Writes resources/app-update.yml (read by electron-updater) and, next to
  // the installer, latest.yml + .blockmap (uploaded by the release workflow).
  // Nothing is uploaded from here: build.mjs passes --publish never.
  publish: updateFeed(process.env),

  // The Next.js standalone server is copied here rather than via
  // extraResources: electron-builder 26 silently drops node_modules and
  // dot-directories (.next) from extraResources, which breaks the server.
  // dereference: Next 16 links serverExternalPackages (argon2) into
  // .next/node_modules via junctions to THIS machine's node_modules — they
  // must become real copies or the app breaks on any other PC.
  afterPack: async (context) => {
    const fs = require("fs");
    const src = r(".next", "standalone");
    const dest = path.join(context.appOutDir, "resources", "standalone");
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, {
      recursive: true,
      dereference: true,
      filter: (p) => {
        const name = path.basename(p);
        return !(name === ".env" || name.startsWith(".env.") || name.endsWith(".map"));
      },
    });
  },
};
