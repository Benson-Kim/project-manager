import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alignDifferentialBase, describedSize, updaterCacheDir } from "../update-cache";

/** A gzipped blockmap like electron-builder writes: one file, chunk sizes adding up to its size. */
function blockmap(sizes: number[], offset = 0): Buffer {
  const checksums = sizes.map((_, i) => `chunk-${i}`);
  return zlib.gzipSync(
    JSON.stringify({ version: "2", files: [{ name: "file", offset, checksums, sizes }] }),
  );
}

let dir: string;
const file = (name: string) => path.join(dir, name);
const write = (name: string, data: Buffer) => fs.writeFileSync(file(name), data);
const installer = (size: number) => write("installer.exe", Buffer.alloc(size));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-update-cache-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("updaterCacheDir", () => {
  it("is the feed's updaterCacheDirName under LOCALAPPDATA", () => {
    const feed =
      "owner: x\nrepo: y\nprovider: github\nupdaterCacheDirName: project-manager-updater\n";
    expect(updaterCacheDir(feed, "C:\\Users\\u\\AppData\\Local")).toBe(
      path.join("C:\\Users\\u\\AppData\\Local", "project-manager-updater"),
    );
  });

  it("reads a quoted name and a CRLF feed", () => {
    expect(updaterCacheDir("updaterCacheDirName: 'pm-updater'\r\n", "L")).toBe(
      path.join("L", "pm-updater"),
    );
  });

  it("is null when the feed names no cache folder", () => {
    expect(updaterCacheDir("provider: github\n", "L")).toBeNull();
  });
});

describe("describedSize", () => {
  it("adds the chunk sizes to the file offset", () => {
    expect(describedSize(blockmap([100, 250, 50]))).toBe(400);
    expect(describedSize(blockmap([100], 24))).toBe(124);
  });

  it("is null for anything that is not a gzipped blockmap", () => {
    expect(describedSize(Buffer.from("not gzip"))).toBeNull();
    expect(describedSize(zlib.gzipSync("{}"))).toBeNull();
    expect(describedSize(zlib.gzipSync(JSON.stringify({ files: [{ sizes: ["1"] }] })))).toBeNull();
  });
});

describe("alignDifferentialBase", () => {
  it("keeps a blockmap that describes installer.exe, and a copy of it", () => {
    installer(400);
    write("current.blockmap", blockmap([300, 100]));
    expect(alignDifferentialBase(dir)).toBe("kept");
    expect(fs.readFileSync(file("installed.blockmap"))).toEqual(
      fs.readFileSync(file("current.blockmap")),
    );
  });

  it("puts the installed version's blockmap back after an update was downloaded but not installed", () => {
    installer(400);
    write("current.blockmap", blockmap([300, 100]));
    alignDifferentialBase(dir);
    // electron-updater downloads 1.0.9 and overwrites current.blockmap with 1.0.9's map...
    write("current.blockmap", blockmap([300, 100, 7]));
    // ...nobody installs it, and the next check must build 1.0.10 from the installed 1.0.8.
    expect(alignDifferentialBase(dir)).toBe("restored");
    expect(describedSize(fs.readFileSync(file("current.blockmap")))).toBe(400);
  });

  it("removes a stale blockmap when no copy matches, so the running version's is fetched", () => {
    installer(400);
    write("current.blockmap", blockmap([300, 107]));
    expect(alignDifferentialBase(dir)).toBe("removed");
    expect(fs.existsSync(file("current.blockmap"))).toBe(false);
  });

  it("replaces a copy that no longer matches once a newer installer.exe is in place", () => {
    installer(400);
    write("current.blockmap", blockmap([400]));
    alignDifferentialBase(dir);
    installer(407);
    write("current.blockmap", blockmap([400, 7]));
    expect(alignDifferentialBase(dir)).toBe("kept");
    expect(describedSize(fs.readFileSync(file("installed.blockmap")))).toBe(407);
  });

  it("touches nothing without installer.exe", () => {
    write("current.blockmap", blockmap([300, 107]));
    expect(alignDifferentialBase(dir)).toBe("no-base");
    expect(fs.existsSync(file("current.blockmap"))).toBe(true);
  });

  it("copes with a missing cache folder", () => {
    expect(alignDifferentialBase(path.join(dir, "never-created"))).toBe("no-base");
  });
});
