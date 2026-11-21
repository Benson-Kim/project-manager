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
//   PM_UPDATE_URL     — alternative feed: a public HTTPS folder with latest.yml + installer.
//   PM_UPDATE_FEED=off — build without a feed (auto-update disabled).
//   Code signing (ADR-0034), exactly one of:
//     PM_AZURE_SIGN_ENDPOINT / _ACCOUNT / _PROFILE — Microsoft Trusted Signing (with the
//                       AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET it signs in with);
//     PM_SIGN_CERT_SHA1 — a CA certificate whose key the CA's signing tool holds;
//     CSC_LINK / CSC_KEY_PASSWORD — the self-issued PFX, for the bridging release only.
//   PM_PUBLISHER      — the signing certificate's subject, verified by installed apps.
//   PM_NEXT_PUBLISHER — the subject that signs the releases after this one (bridging release).
// Read by scripts/desktop/build.mjs (scripts/desktop/licensing.cjs), not here:
//   PM_LICENSING           — "enforce" turns licensing on; empty leaves it off.
//   PM_LICENCE_PUBLIC_KEYS — JSON object of key id to base64url Ed25519 public key.
//   PM_LICENCE_SERVICE_URL — the licence service's https:// address.

const fs = require("fs");
const path = require("path");
const { signingConfig, SIGN_EXTS } = require("./scripts/desktop/signing.cjs");
const { updateFeed } = require("./scripts/desktop/update-feed.cjs");

const root = __dirname;
const r = (...p) => path.join(root, ...p);
// The self-issued publisher certificate (public half), trusted on each PC by provision.ps1.
const PUBLISHER_CER = r("build-resources", "publisher.cer");
const signing = signingConfig(process.env, fs.existsSync(PUBLISHER_CER));
const feed = updateFeed(process.env);
// The full installer (a PC's first install) also carries the SQL Server media. Updates use the
// slim one, so latest.yml and the .blockmap always describe it; the full one is built into its
// own folder and keeps the update feed, so a PC set up from it still updates itself.
const fullInstaller = process.env.MODULUS_FULL_INSTALLER === "1";

// The Next server's native modules sit outside the folders electron-builder signs by itself.
async function signServerBinaries(packager, dir) {
  if (!signing.signed) return;
  if (typeof packager.signIf !== "function") {
    throw new Error(
      "electron-builder no longer exposes signIf: the server's native modules would ship unsigned.",
    );
  }
  const kinds = SIGN_EXTS.filter((ext) => !ext.startsWith("!"));
  const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, String(f)));
  for (const file of files.filter((f) => kinds.some((ext) => f.endsWith(ext)))) {
    await packager.signIf(file);
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.eliandigitalsolutions.modulus",
  productName: "Modulus",
  copyright: "Copyright © 2026 ElianDigitalSolutions",
  electronVersion: require("./node_modules/electron/package.json").version,

  directories: {
    output: fullInstaller ? r("dist-installer", "full") : r("dist-installer"),
    buildResources: r("build-resources"),
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  asar: true,
  electronLanguages: ["en-US"],
  // Flipped in the Electron binary before it is signed (ADR-0034). runAsNode stays on:
  // next-server.ts forks the Next server with this binary running as Node.
  electronFuses: {
    runAsNode: true,
    onlyLoadAppFromAsar: true,
    enableEmbeddedAsarIntegrityValidation: true,
    enableNodeCliInspectArguments: false,
    enableNodeOptionsEnvironmentVariable: false,
  },
  // Every file build.mjs stages; anything left out is missing from app.asar at runtime
  // (scripts/desktop/tests/packaged-files.test.mjs).
  files: [
    "main.js",
    "grammar-worker.js",
    "preload.js",
    "licence-preload.js",
    "harper_wasm_slim_bg.wasm",
    "splash.html",
    "splash-logo.png",
    "licence.html",
    "package.json",
  ],

  extraResources: [
    { from: r("db"), to: "db", filter: ["migrations/*.sql", "procs/**/*.sql", "seed/*.sql"] },
    {
      from: r("electron", "setup"),
      to: "setup",
      filter: ["provision.ps1", "remove-all-users-install.ps1"],
    },
    ...(fullInstaller
      ? [{ from: r("installers", "sql-express"), to: "sql-express", filter: ["SQLEXPR_x64_ENU.exe"] }]
      : []),
    { from: r("build-resources", "icon.ico"), to: "icon.ico" },
    ...(signing.shipCertificate ? [{ from: PUBLISHER_CER, to: "setup/publisher.cer" }] : []),
  ],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: r("build-resources", "icon.ico"),
    artifactName: fullInstaller ? "Modulus-Setup-Full-${version}.${ext}" : "Modulus-Setup-${version}.${ext}",
    // Signing method, timestamping and the files signed (scripts/desktop/signing.cjs).
    ...signing.win,
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
    shortcutName: "Modulus",
    deleteAppDataOnUninstall: false,
    include: r("build-resources", "installer.nsh"),
  },

  // Writes resources/app-update.yml (read by electron-updater) and, next to
  // the installer, latest.yml + .blockmap (uploaded by the release workflow).
  // Nothing is uploaded from here: build.mjs passes --publish never.
  // publisherName lands in app-update.yml: electron-updater then refuses an installer whose
  // Authenticode signature is not valid on the PC or not from one of these subjects (ADR-0034).
  publish:
    feed && signing.publisherName
      ? feed.map((entry) => ({ ...entry, publisherName: signing.publisherName }))
      : feed,

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
    await signServerBinaries(context.packager, dest);
  },
};
