import { describe, expect, it } from "vitest";
import {
  addLocationInput,
  attachmentRowSchema,
  downloadParamsSchema,
  locationHref,
  uploadQuerySchema,
} from "../schemas/attachment";

describe("attachment schemas (ADR-0026)", () => {
  it("parses the upload query and cleans the name", () => {
    expect(
      uploadQuerySchema.parse({ owner: "daily-activity", ownerId: "12", name: " a/b.pdf " }),
    ).toEqual({ owner: "daily-activity", ownerId: 12, name: "ab.pdf" });
  });

  it.each([
    { owner: "project", ownerId: "1", name: "a.pdf" },
    { owner: "daily-activity", ownerId: "1.5", name: "a.pdf" },
    { owner: "daily-activity", ownerId: "1", name: "" },
    { owner: "daily-activity", ownerId: "1", name: "/\\:" },
  ])("refuses the upload query %j", (query) => {
    expect(uploadQuerySchema.safeParse(query).success).toBe(false);
  });

  it("shortens a long name instead of refusing it", () => {
    const parsed = uploadQuerySchema.parse({
      owner: "daily-activity",
      ownerId: "1",
      name: `${"x".repeat(300)}.pdf`,
    });
    expect(parsed.name).toHaveLength(255);
    expect(parsed.name.endsWith(".pdf")).toBe(true);
  });

  it("parses download params", () => {
    expect(downloadParamsSchema.parse({ owner: "daily-activity", id: "7" })).toEqual({
      owner: "daily-activity",
      id: 7,
    });
    expect(downloadParamsSchema.safeParse({ owner: null, id: "7" }).success).toBe(false);
  });

  it("caps a location at 500 characters", () => {
    const base = { owner: "daily-activity", ownerId: 1, fileName: "C" };
    expect(addLocationInput.safeParse({ ...base, storageLocation: "x".repeat(500) }).success).toBe(
      true,
    );
    expect(addLocationInput.safeParse({ ...base, storageLocation: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("keeps a location row's empty size and type as null (not 0)", () => {
    const row = attachmentRowSchema.parse({
      FileAttachmentId: 1,
      FileName: "Contract",
      ContentType: null,
      SizeBytes: null,
      StorageLocation: "Drawer",
      CreatedAtUtc: new Date(),
      CreatedByName: null,
      RowVer: "3",
    });
    expect(row.SizeBytes).toBeNull();
    expect(row.RowVer).toBe(3);
  });
});

describe("locationHref: only web addresses become links", () => {
  it.each([
    ["https://contoso.sharepoint.com/sites/pm/Shared%20Documents/a.pdf", true],
    ["http://intranet/docs", true],
    ["javascript:alert(1)", false],
    ["JaVaScRiPt:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["file:///C:/secret.txt", false],
    ["\\\\fs01\\projects\\contract.pdf", false],
    ["Drawer 3, blue folder", false],
    ["vbscript:msgbox", false],
  ])("%s → link %s", (location, isLink) => {
    expect(locationHref(location) !== null).toBe(isLink);
  });
});
