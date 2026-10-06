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
// Optional build-time environment:
//   PM_UPDATE_URL  — static URL hosting latest.yml + the installer; enables auto-update.
//   CSC_LINK / CSC_KEY_PASSWORD — code-signing certificate (removes the SmartScreen warning).

const path = require("path");

const root = __dirname;
const r = (...p) => path.join(root, ...p);
const updateUrl = process.env.PM_UPDATE_URL;

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
    { from: r("electron", "setup"), to: "setup", filter: ["provision.ps1"] },
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
    // SQL Server is a machine-wide service: install for all users, elevated once.
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
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

  publish: updateUrl ? [{ provider: "generic", url: updateUrl }] : null,

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
