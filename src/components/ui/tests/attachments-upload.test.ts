import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { MAX_UPLOAD_BYTES } from "@/modules/file-storage/schemas/attachment";
import { downloadUrl, preflight, readUploadResponse, uploadUrl } from "../attachments/upload-file";

describe("upload preflight (the server re-checks everything)", () => {
  it.each([
    ["Plan.pdf", 10, null],
    ["Budget.XLSX", 10, null],
    ["scan.jpeg", MAX_UPLOAD_BYTES, null],
    ["empty.pdf", 0, messages.attachments.errors.empty],
    ["huge.pdf", MAX_UPLOAD_BYTES + 1, messages.attachments.errors.tooLarge],
    ["setup.exe", 10, messages.attachments.errors.typeNotAllowed],
    ["page.html", 10, messages.attachments.errors.typeNotAllowed],
    ["noext", 10, messages.attachments.errors.typeNotAllowed],
  ])("%s (%d bytes) → %s", (name, size, problem) => {
    expect(preflight({ name, size })).toBe(problem);
  });
});

describe("upload and download URLs", () => {
  it("puts owner, id and the encoded name in the query string", () => {
    expect(uploadUrl("daily-activity", 12, "Q3 & Q4 été.pdf")).toBe(
      "/api/files?owner=daily-activity&ownerId=12&name=Q3+%26+Q4+%C3%A9t%C3%A9.pdf",
    );
    expect(downloadUrl("daily-activity", 5)).toBe("/api/files/5?owner=daily-activity");
  });
});

describe("readUploadResponse", () => {
  it("reads a success", () => {
    expect(
      readUploadResponse(201, JSON.stringify({ ok: true, data: { FileName: "Plan.pdf", x: 1 } })),
    ).toEqual({ ok: true, fileName: "Plan.pdf" });
  });

  it("passes on the server's message", () => {
    expect(
      readUploadResponse(
        422,
        JSON.stringify({ ok: false, error: { code: "QUOTA_EXCEEDED", message: "Full." } }),
      ),
    ).toEqual({ ok: false, message: "Full." });
  });

  it.each([
    [502, "<html>Bad gateway</html>"],
    [413, ""],
    [500, JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "" } })],
    [500, JSON.stringify({ ok: true, data: { FileName: "x" } })],
    [201, JSON.stringify({ ok: true })],
  ])("falls back to a generic message for %d %j", (status, body) => {
    expect(readUploadResponse(status, body)).toEqual({
      ok: false,
      message: messages.errors.INTERNAL,
    });
  });
});
