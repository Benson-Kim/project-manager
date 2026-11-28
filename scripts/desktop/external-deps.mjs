// `next build` copies only the files it traced out of a serverExternalPackages
// package, and none of the packages that package requires at run time. The
// packaged server then dies on its first require: argon2 reached the installer
// without node-gyp-build, and web-push as a lone package.json. These helpers copy
// each external package, and everything it depends on, out of the real
// node_modules, and let the build fail loudly if the installer lacks any of it.
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const CONFIG = /serverExternalPackages\s*:\s*\[([^\]]*)\]/;

export function externalPackages(root) {
  const config = readFileSync(join(root, "next.config.ts"), "utf-8");
  const found = CONFIG.exec(config);
  if (!found) throw new Error("serverExternalPackages not found in next.config.ts");
  return [...found[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

function packageDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

// Source maps are left out of the count: electron-builder strips them from the
// packaged tree on purpose, and nothing requires one at run time, so counting
// them would make every mapped package look half-copied in the installer.
const fileCount = (dir) =>
  readdirSync(dir, { recursive: true }).filter((f) => {
    const name = String(f);
    if (name.endsWith(".map")) return false;
    try {
      return statSync(join(dir, name)).isFile();
    } catch {
      return false;
    }
  }).length;

// Every package the externals need at run time, keyed by its path relative to the
// repo root. Keeping that layout means a require() resolves in the installer
// exactly as it does here, nested copies of a package included.
export function externalClosure(root, names = externalPackages(root)) {
  const closure = new Map();
  const queue = names.map((name) => [name, root]);
  while (queue.length) {
    const [name, from] = queue.shift();
    const dir = packageDir(name, from);
    if (!dir) throw new Error(`${name} is required by a server external package but is not installed`);
    const key = relative(root, dir).split("\\").join("/");
    if (closure.has(key)) continue;
    closure.set(key, dir);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push([dep, dir]);
  }
  return closure;
}

export function completeExternalPackages(root, standalone) {
  const copied = [];
  for (const [key, dir] of externalClosure(root)) {
    const target = join(standalone, key);
    if (existsSync(target) && fileCount(target) === fileCount(dir)) continue;
    cpSync(dir, target, { recursive: true, dereference: true, force: true });
    copied.push(key.replace(/^node_modules\//, ""));
  }
  return copied;
}

export function missingExternalDeps(root, standalone) {
  const short = [];
  for (const [key, dir] of externalClosure(root)) {
    const target = join(standalone, key);
    if (!existsSync(target)) short.push(key.replace(/^node_modules\//, ""));
    else if (fileCount(target) !== fileCount(dir)) short.push(`${key.replace(/^node_modules\//, "")} (incomplete)`);
  }
  return short;
}
