import { describe, expect, it } from "vitest";
import { sidebarInitScript, sidebarStateOf } from "../sidebar-state";

function runInitScript(stored: string | null | (() => never)) {
  const attributes = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => {
      if (typeof stored === "function") return stored();
      return key === "sidebar" ? stored : null;
    },
  };
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  new Function("localStorage", "document", sidebarInitScript)(localStorage, document);
  return attributes.get("data-sidebar");
}

describe("sidebar state", () => {
  it("reads only an exact collapsed value as collapsed", () => {
    expect(sidebarStateOf("collapsed")).toBe("collapsed");
    expect(sidebarStateOf("expanded")).toBe("expanded");
    expect(sidebarStateOf(null)).toBe("expanded");
    expect(sidebarStateOf(undefined)).toBe("expanded");
    expect(sidebarStateOf("Collapsed")).toBe("expanded");
  });

  it("puts the stored state on html before first paint, the same way", () => {
    expect(runInitScript("collapsed")).toBe("collapsed");
    expect(runInitScript(null)).toBe("expanded");
    expect(runInitScript("junk")).toBe("expanded");
  });

  it("leaves html alone when storage is blocked, so the app falls back on mount", () => {
    expect(
      runInitScript(() => {
        throw new Error("blocked");
      }),
    ).toBeUndefined();
  });
});
