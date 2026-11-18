/**
 * Copies Excalidraw's fonts into public/excalidraw-assets/fonts, so the whiteboard loads them
 * from this origin (CSP font-src 'self') and works offline. Runs before `next dev` and
 * `next build`; the copy is not committed.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "fonts");
const target = join(root, "public", "excalidraw-assets", "fonts");

if (!existsSync(source)) {
  console.error(`Excalidraw fonts not found at ${source}. Run npm install first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied Excalidraw fonts to ${target}`);
