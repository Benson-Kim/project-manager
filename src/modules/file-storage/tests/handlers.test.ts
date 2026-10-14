import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, unlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Session } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { scanFile } from "@/lib/files/scan";
import { sniffFile } from "@/lib/files/sniff";
import { storagePathOf, TEMP_DIR } from "@/lib/files/store";
import { messages } from "@/lib/messages";
import { handleDownload, type DownloadDeps } from "../handlers/download";
import { handleUpload, type UploadDeps } from "../handlers/upload";
import { MAX_UPLOAD_BYTES, type AttachmentRow } from "../schemas/attachment";

const ORIGIN = "http://127.0.0.1:3000";
const PDF = Buffer.from("%PDF-1.7\nhello\n");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const row: AttachmentRow = {
  FileAttachmentId: 5,
  FileName: "Plan.pdf",
  ContentType: "application/pdf",
  SizeBytes: PDF.length,
  StorageLocation: null,
  CreatedAtUtc: new Date("2026-10-10T08:00:00Z"),
  CreatedByName: "Grace",
  RowVer: 9,
};

/** fileRoute has checked same-origin and the session (tests/session-and-wiring.test.ts). */
const user: Session = { userId: 7, username: "pm", role: "User" };

let root: string;
let deps: UploadDeps & {
  checkCanAdd: Mock<UploadDeps["checkCanAdd"]>;
  addFile: Mock<UploadDeps["addFile"]>;
};

const post = (request: Request, d: UploadDeps = deps) => handleUpload(request, user, d);

function upload(
  body: BodyInit | null,
  {
    query = "owner=daily-activity&ownerId=12&name=Plan.pdf",
    headers = {},
  }: { query?: string; headers?: Record<string, string> } = {},
) {
  return new Request(`${ORIGIN}/api/files?${query}`, {
    method: "POST",
    body,
    headers: {
      origin: ORIGIN,
      host: "127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/octet-stream",
      ...headers,
    },
    duplex: "half",
  } as RequestInit);
}

async function tempFiles() {
  return readdir(path.join(root, TEMP_DIR)).catch(() => []);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "pm-handlers-"));
  await mkdir(path.join(root, TEMP_DIR));
  deps = {
    uploadsEnabled: () => true,
    uploadsRoot: () => Promise.resolve(root),
    quotaBytes: () => 1024 * 1024,
    minFreeBytes: () => 0,
    freeBytes: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
    checkCanAdd: vi
      .fn<UploadDeps["checkCanAdd"]>()
      .mockResolvedValue({ ProjectId: 3, UsedBytes: 0 }),
    addFile: vi.fn<UploadDeps["addFile"]>().mockResolvedValue(row),
    sniff: sniffFile,
    scan: scanFile,
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("POST /api/files (ADR-0026 §3)", () => {
  it("stores the bytes under their hash and records the attachment", async () => {
    const res = await post(upload(PDF), deps);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, data: { FileAttachmentId: 5 } });
    expect(deps.checkCanAdd).toHaveBeenCalledWith("daily-activity", 12, 7);
    const hash = sha(PDF);
    expect(deps.addFile).toHaveBeenCalledWith(
      "daily-activity",
      12,
      {
        fileName: "Plan.pdf",
        contentType: "application/pdf",
        sizeBytes: PDF.length,
        sha256: hash,
        storagePath: storagePathOf(hash),
      },
      1024 * 1024,
      7,
    );
    expect(await readdir(path.join(root, hash.slice(0, 2), hash.slice(2, 4)))).toEqual([hash]);
    expect(await tempFiles()).toEqual([]);
  });

  it("cleans the name from the query string", async () => {
    await post(
      upload(PDF, {
        query: `owner=daily-activity&ownerId=12&name=${encodeURIComponent("..\\a/b\r\n.pdf")}`,
      }),
      deps,
    );
    expect(deps.addFile.mock.calls[0]![2].fileName).toBe("..ab.pdf");
  });

  describe("the disk's free-space floor (ADR-0026 §6)", () => {
    const MB = 1024 * 1024;
    const floored = (free: number) => ({
      ...deps,
      minFreeBytes: () => 100 * MB,
      freeBytes: vi.fn<UploadDeps["freeBytes"]>().mockResolvedValue(free),
    });
    const declared = () => upload(PDF, { headers: { "content-length": String(PDF.length) } });

    it("refuses (507) before reading a byte when the upload would go below it", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const d = floored(100 * MB + PDF.length - 1);
      const res = await post(declared(), d);
      expect(res.status).toBe(507);
      expect(await res.json()).toMatchObject({
        error: { message: messages.attachments.errors.diskFull },
      });
      expect(d.freeBytes).toHaveBeenCalledWith(root);
      expect(deps.addFile).not.toHaveBeenCalled();
      expect(await tempFiles()).toEqual([]);
      warn.mockRestore();
    });

    it("lets it through when the upload leaves the floor free", async () => {
      const res = await post(declared(), floored(100 * MB + PDF.length));
      expect(res.status).toBe(201);
    });

    it("counts uploads still being received against the floor, until each one ends", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      // Both read the free space before either writes: room for one of them only.
      let release!: () => void;
      const bothAsked = new Promise<void>((resolve) => (release = resolve));
      let asked = 0;
      const d = {
        ...floored(100 * MB + PDF.length),
        freeBytes: vi.fn<UploadDeps["freeBytes"]>(async () => {
          if (++asked === 2) release();
          await bothAsked;
          return 100 * MB + PDF.length;
        }),
      };
      const statuses = (await Promise.all([post(declared(), d), post(declared(), d)])).map(
        (r) => r.status,
      );
      expect(statuses.sort()).toEqual([201, 507]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${PDF.length} reserved`));

      // Both ended (one stored, one refused): nothing is held any more.
      expect((await post(declared(), floored(100 * MB + PDF.length))).status).toBe(201);
      warn.mockRestore();
    });

    it("frees the reservation when the upload is refused after it", async () => {
      const refused = await post(declared(), {
        ...floored(100 * MB + PDF.length),
        scan: () => Promise.resolve({ clean: false, reason: "EICAR" }),
      });
      expect(refused.status).toBe(422);
      expect((await post(declared(), floored(100 * MB + PDF.length))).status).toBe(201);
    });

    it("reserves the 25 MB cap for a declared size that is not a positive whole number", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const res = await post(
        upload(PDF, { headers: { "content-length": "-5" } }),
        floored(100 * MB + MAX_UPLOAD_BYTES - 1),
      );
      expect(res.status).toBe(507);
      warn.mockRestore();
    });

    it("assumes the 25 MB cap for a body of unknown length", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(PDF);
          controller.close();
        },
      });
      const res = await post(upload(stream), floored(100 * MB + MAX_UPLOAD_BYTES - 1));
      expect(res.status).toBe(507);
      warn.mockRestore();
    });
  });

  it("answers 503 'not set up' when uploads are off, before any access check or byte (ADR-0026 §9)", async () => {
    const uploadsRoot = vi.fn();
    const res = await post(upload(PDF), {
      ...deps,
      uploadsEnabled: () => false,
      uploadsRoot,
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { message: messages.attachments.errors.notSetUp },
    });
    expect(deps.checkCanAdd).not.toHaveBeenCalled();
    expect(uploadsRoot).not.toHaveBeenCalled();
  });

  it.each([
    "owner=user&ownerId=12&name=a.pdf",
    "owner=daily-activity&ownerId=0&name=a.pdf",
    "owner=daily-activity&ownerId=abc&name=a.pdf",
    "owner=daily-activity&ownerId=12&name=%2F%2F",
    "owner=daily-activity&ownerId=12",
  ])("refuses the query %s", async (query) => {
    const res = await post(upload(PDF, { query }), deps);
    expect(res.status).toBe(400);
    expect(deps.checkCanAdd).not.toHaveBeenCalled();
  });

  it("refuses a declared size over 25 MB before reading anything", async () => {
    const res = await post(
      upload(PDF, { headers: { "content-length": String(MAX_UPLOAD_BYTES + 1) } }),
      deps,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toBe(messages.attachments.errors.tooLarge);
    expect(deps.checkCanAdd).not.toHaveBeenCalled();
  });

  it("stops a body that grows past 25 MB and keeps nothing", async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    chunk.write("%PDF-");
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 30) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const res = await post(upload(body), deps);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(30);
    expect(deps.addFile).not.toHaveBeenCalled();
    expect(await tempFiles()).toEqual([]);
  });

  it("refuses an empty body", async () => {
    const res = await post(upload(Buffer.alloc(0)), deps);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(messages.attachments.errors.empty);
  });

  it("answers 404 when the owner's pre-check refuses (a Viewer, another project)", async () => {
    deps.checkCanAdd.mockRejectedValue(new AppError("FORBIDDEN_ROW", "no"));
    const res = await post(upload(PDF), deps);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await tempFiles()).toEqual([]);
  });

  it("refuses early when the declared size cannot fit the quota", async () => {
    deps.checkCanAdd.mockResolvedValue({ ProjectId: 3, UsedBytes: 1024 * 1024 - 5 });
    const res = await post(
      upload(PDF, { headers: { "content-length": String(PDF.length) } }),
      deps,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "QUOTA_EXCEEDED", message: messages.errors.QUOTA_EXCEEDED },
    });
    expect(deps.addFile).not.toHaveBeenCalled();
  });

  it("passes on the proc's authoritative quota refusal", async () => {
    deps.addFile.mockRejectedValue(new AppError("QUOTA_EXCEEDED", "full"));
    const res = await post(upload(PDF), deps);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("QUOTA_EXCEEDED");
  });

  it.each([
    ["a PDF named .docx", "name=Plan.docx", PDF],
    ["an HTML page", "name=page.html", Buffer.from("<script>alert(1)</script>")],
  ])("refuses %s (415) and keeps nothing", async (_l, name, body) => {
    const res = await post(
      upload(body, { query: `owner=daily-activity&ownerId=12&${name}` }),
      deps,
    );
    expect(res.status).toBe(415);
    expect((await res.json()).error.message).toBe(messages.attachments.errors.typeNotAllowed);
    expect(deps.addFile).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([TEMP_DIR]);
    expect(await tempFiles()).toEqual([]);
  });

  it("refuses what the AV hook refuses", async () => {
    const res = await post(upload(PDF), {
      ...deps,
      scan: () => Promise.resolve({ clean: false, reason: "EICAR" }),
    });
    expect(res.status).toBe(422);
    expect(deps.addFile).not.toHaveBeenCalled();
    expect(await tempFiles()).toEqual([]);
  });

  it("hides unexpected failures behind INTERNAL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deps.addFile.mockRejectedValue(new Error("socket hang up"));
    const res = await post(upload(PDF), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("socket");
    error.mockRestore();
  });
});

describe("GET /api/files/<id> (ADR-0026 §3)", () => {
  const hash = sha(PDF);
  let getFile: Mock<DownloadDeps["getFile"]>;
  let downloadDeps: DownloadDeps;

  beforeEach(async () => {
    const dir = path.join(root, hash.slice(0, 2), hash.slice(2, 4));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, hash), PDF);
    getFile = vi.fn<DownloadDeps["getFile"]>().mockResolvedValue({
      FileAttachmentId: 5,
      FileName: "Procès-verbal.pdf",
      ContentType: "application/pdf",
      SizeBytes: PDF.length,
      Sha256: hash,
      StoragePath: storagePathOf(hash),
      StorageLocation: null,
    });
    downloadDeps = {
      storedFilesRoot: () => root,
      getFile,
    };
  });

  const get = (id: string, owner = "daily-activity") =>
    handleDownload(new Request(`${ORIGIN}/api/files/${id}?owner=${owner}`), user, id, downloadDeps);

  it("streams the bytes as a sandboxed, uncached download", async () => {
    const res = await get("5");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    expect(getFile).toHaveBeenCalledWith("daily-activity", 5, 7);
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Proc_s-verbal.pdf\"; filename*=UTF-8''Proc%C3%A8s-verbal.pdf",
    );
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(PDF.length));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it.each([
    ["NOT_FOUND", new AppError("NOT_FOUND", "x")],
    ["FORBIDDEN_ROW", new AppError("FORBIDDEN_ROW", "x")],
  ])("answers the same 404 for %s", async (_l, err) => {
    getFile.mockRejectedValue(err);
    const res = await get("5");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each([
    ["an unknown owner", "5", "user"],
    ["a bad id", "abc", "daily-activity"],
    ["a negative id", "-1", "daily-activity"],
  ])("answers 404 for %s without asking the database", async (_l, id, owner) => {
    expect((await get(id, owner)).status).toBe(404);
    expect(getFile).not.toHaveBeenCalled();
  });

  it("answers 404 for a location (no bytes)", async () => {
    getFile.mockResolvedValue({
      FileAttachmentId: 6,
      FileName: "Contract",
      ContentType: null,
      SizeBytes: null,
      Sha256: null,
      StoragePath: null,
      StorageLocation: "Drawer 3",
    });
    expect((await get("6")).status).toBe(404);
  });

  it("answers 404 (and logs) when the bytes are gone from disk", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await unlink(path.join(root, hash.slice(0, 2), hash.slice(2, 4), hash));
    expect((await get("5")).status).toBe(404);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("answers 404 (and logs) when the stored file is not the recorded size", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await writeFile(path.join(root, hash.slice(0, 2), hash.slice(2, 4), hash), "replaced");
    expect((await get("5")).status).toBe(404);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("never delivers all the bytes of a same-size file whose hash is wrong", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tampered = Buffer.from(PDF);
    tampered[tampered.length - 2] = 0x21; // same size, other bytes
    await writeFile(path.join(root, hash.slice(0, 2), hash.slice(2, 4), hash), tampered);
    const res = await get("5");
    expect(res.status).toBe(200);
    await expect(res.arrayBuffer()).rejects.toThrow();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringContaining("stored bytes changed")),
    );
    error.mockRestore();
  });

  it("never serves a path the database did not shape as a hash path", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getFile.mockResolvedValue({
      FileAttachmentId: 5,
      FileName: "x",
      ContentType: "application/pdf",
      SizeBytes: 1,
      Sha256: hash,
      StoragePath: "../../etc/passwd",
      StorageLocation: null,
    });
    expect((await get("5")).status).toBe(404);
    error.mockRestore();
  });

  it("hides unexpected database failures behind INTERNAL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getFile.mockRejectedValue(new Error("pool closed"));
    const res = await get("5");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("pool");
    error.mockRestore();
  });
});
