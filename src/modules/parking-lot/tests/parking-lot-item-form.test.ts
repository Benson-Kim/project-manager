import { describe, expect, it } from "vitest";
import {
  parkingLotItemFormSchema,
  updateParkingLotItemFormSchema,
} from "../schemas/parking-lot-item-form";

/**
 * ParkingLotItem form contract (#18): FormData strings → repository input shape.
 * Covers required item text, optional stakeholderId → null, checkbox coercion,
 * rowVer coercion.
 */

const minimal = { projectId: "2", parkingLotItem: "Something to discuss" };

describe("parkingLotItemFormSchema", () => {
  it("parses a minimal create — optional fields get defaults", () => {
    const parsed = parkingLotItemFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.parkingLotItem).toBe("Something to discuss");
    expect(parsed.stakeholderId).toBeNull();
    expect(parsed.isStrikethrough).toBe(false);
  });

  it("trims and keeps a supplied item", () => {
    const parsed = parkingLotItemFormSchema.parse({
      ...minimal,
      parkingLotItem: "  Something to discuss  ",
    });
    expect(parsed.parkingLotItem).toBe("Something to discuss");
  });

  it("rejects an empty item", () => {
    const result = parkingLotItemFormSchema.safeParse({ ...minimal, parkingLotItem: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "parkingLotItem")).toBe(true);
    }
  });

  it("rejects a missing item", () => {
    const result = parkingLotItemFormSchema.safeParse({ projectId: "2" });
    expect(result.success).toBe(false);
  });

  it("coerces empty-string stakeholderId to null", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, stakeholderId: "" });
    expect(parsed.stakeholderId).toBeNull();
  });

  it("coerces a numeric string stakeholderId to number", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, stakeholderId: "3" });
    expect(parsed.stakeholderId).toBe(3);
  });

  it("coerces checkbox 'on' to true", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, isStrikethrough: "on" });
    expect(parsed.isStrikethrough).toBe(true);
  });

  it("coerces absent checkbox to false", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal });
    expect(parsed.isStrikethrough).toBe(false);
  });

  it("coerces boolean true to true", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, isStrikethrough: true });
    expect(parsed.isStrikethrough).toBe(true);
  });

  it("coerces empty-string followUpActions to null", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, followUpActions: "" });
    expect(parsed.followUpActions).toBeNull();
  });

  it("keeps a supplied followUpActions string", () => {
    const parsed = parkingLotItemFormSchema.parse({
      ...minimal,
      followUpActions: "Check with team",
    });
    expect(parsed.followUpActions).toBe("Check with team");
  });

  it("coerces empty-string owner to null", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, owner: "" });
    expect(parsed.owner).toBeNull();
  });

  it("keeps a supplied owner string", () => {
    const parsed = parkingLotItemFormSchema.parse({ ...minimal, owner: "Alice" });
    expect(parsed.owner).toBe("Alice");
  });

  it("accepts a 255-character parkingLotItem (upper boundary)", () => {
    const longItem = "a".repeat(255);
    const result = parkingLotItemFormSchema.safeParse({ ...minimal, parkingLotItem: longItem });
    expect(result.success).toBe(true);
  });

  it("rejects a 256-character parkingLotItem (over boundary)", () => {
    const tooLong = "a".repeat(256);
    const result = parkingLotItemFormSchema.safeParse({ ...minimal, parkingLotItem: tooLong });
    expect(result.success).toBe(false);
  });

  it("accepts a 255-character owner (upper boundary)", () => {
    const longOwner = "a".repeat(255);
    const result = parkingLotItemFormSchema.safeParse({ ...minimal, owner: longOwner });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.owner).toBe(longOwner);
  });

  it("rejects a 256-character owner (over boundary)", () => {
    const tooLong = "a".repeat(256);
    const result = parkingLotItemFormSchema.safeParse({ ...minimal, owner: tooLong });
    expect(result.success).toBe(false);
  });
});

describe("updateParkingLotItemFormSchema", () => {
  it("coerces parkingLotItemId and rowVer from FormData strings", () => {
    const parsed = updateParkingLotItemFormSchema.parse({
      ...minimal,
      parkingLotItemId: "5",
      rowVer: "99",
    });
    expect(parsed.parkingLotItemId).toBe(5);
    expect(parsed.rowVer).toBe(99);
  });

  it("requires parkingLotItemId to be positive", () => {
    const result = updateParkingLotItemFormSchema.safeParse({
      ...minimal,
      parkingLotItemId: "0",
      rowVer: "1",
    });
    expect(result.success).toBe(false);
  });
});
