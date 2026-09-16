import { describe, expect, it } from "vitest";
import { supplierFormSchema, updateSupplierFormSchema } from "./supplier-form";

/**
 * Supplier form contract (#7): FormData strings → repository input shape.
 * Covers date coercion, optional address fields → null, email validation,
 * rating vocab (ADR-0009 single-schema rule).
 */

const minimal = { projectId: "2", supplierName: "Fiverr Company" };

describe("supplierFormSchema", () => {
  it("parses a minimal create form — optional fields become null", () => {
    const parsed = supplierFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.supplierName).toBe("Fiverr Company");
    expect(parsed.contactPerson).toBeNull();
    expect(parsed.emailAddress).toBeNull();
    expect(parsed.contractStartDate).toBeNull();
    expect(parsed.contractEndDate).toBeNull();
    expect(parsed.rating).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.city).toBeNull();
    expect(parsed.provinceOrState).toBeNull();
    expect(parsed.country).toBeNull();
    expect(parsed.postalCode).toBeNull();
  });

  it("coerces YYYY-MM-DD date strings to Date and '' to null", () => {
    const parsed = supplierFormSchema.parse({
      ...minimal,
      contractStartDate: "2024-12-26",
      contractEndDate: "",
    });
    expect(parsed.contractStartDate).toBeInstanceOf(Date);
    expect(parsed.contractStartDate?.toISOString().slice(0, 10)).toBe("2024-12-26");
    expect(parsed.contractEndDate).toBeNull();
  });

  it("rejects an unparseable date", () => {
    const result = supplierFormSchema.safeParse({ ...minimal, contractEndDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email but accepts a valid one and ''", () => {
    expect(supplierFormSchema.safeParse({ ...minimal, emailAddress: "nope" }).success).toBe(false);
    expect(
      supplierFormSchema.parse({ ...minimal, emailAddress: "info@gtidistributors.com" })
        .emailAddress,
    ).toBe("info@gtidistributors.com");
    expect(supplierFormSchema.parse({ ...minimal, emailAddress: "" }).emailAddress).toBeNull();
  });

  it("rejects an empty supplier name", () => {
    const result = supplierFormSchema.safeParse({ projectId: "2", supplierName: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "supplierName")).toBe(true);
    }
  });

  it("accepts vocab ratings and rejects off-vocab values", () => {
    expect(supplierFormSchema.parse({ ...minimal, rating: "Excellent" }).rating).toBe("Excellent");
    expect(supplierFormSchema.parse({ ...minimal, rating: "" }).rating).toBeNull();
    expect(supplierFormSchema.safeParse({ ...minimal, rating: "Amazing" }).success).toBe(false);
  });

  it("trims optional address fields and keeps values", () => {
    const parsed = supplierFormSchema.parse({
      ...minimal,
      address: " 617 Annex Avenue ",
      city: "Toronto",
      country: "Canada",
      postalCode: "87680",
    });
    expect(parsed.address).toBe("617 Annex Avenue");
    expect(parsed.city).toBe("Toronto");
    expect(parsed.country).toBe("Canada");
    expect(parsed.postalCode).toBe("87680");
  });
});

describe("updateSupplierFormSchema", () => {
  it("coerces supplierId and rowVer from FormData strings", () => {
    const parsed = updateSupplierFormSchema.parse({
      ...minimal,
      supplierId: "13",
      rowVer: "77",
    });
    expect(parsed.supplierId).toBe(13);
    expect(parsed.rowVer).toBe(77);
  });
});
