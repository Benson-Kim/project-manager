// Download the pinned SQL Server Express media (scripts/desktop/sql-express.pin.json)
// and verify its SHA-256. Re-running is a no-op when the file is already correct.
// Usage: npm run electron:fetch-sql
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pin = JSON.parse(readFileSync(join(root, "scripts", "desktop", "sql-express.pin.json"), "utf-8"));
const target = join(root, pin.target);

export async function sha256(file) {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
}

export async function verifySqlMedia() {
  if (!existsSync(target)) return false;
  return (await sha256(target)) === pin.sha256;
}

async function main() {
  if (await verifySqlMedia()) {
    console.log(`OK: ${pin.target} matches the pinned SHA-256 (${pin.product} ${pin.version}).`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  console.log(`Downloading ${pin.product} (${(pin.bytes / 1048576).toFixed(0)} MB)\n  ${pin.url}`);
  const res = await fetch(pin.url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  const actual = await sha256(part);
  if (actual !== pin.sha256) {
    rmSync(part, { force: true });
    throw new Error(`Checksum mismatch: expected ${pin.sha256}, got ${actual}. Not using this file.`);
  }
  renameSync(part, target);
  console.log(`OK: saved and verified ${pin.target}`);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
