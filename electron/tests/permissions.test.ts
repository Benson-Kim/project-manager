import { describe, expect, it } from "vitest";
import { allowPermission } from "../permissions";

const OWN = "http://127.0.0.1:51234";

describe("allowPermission", () => {
  it("lets the app's own pages show desktop alerts, copy to the clipboard and go full screen", () => {
    expect(allowPermission("notifications", `${OWN}/todo`, OWN)).toBe(true);
    expect(
      allowPermission("clipboard-sanitized-write", `${OWN}/projects/2/daily-activities`, OWN),
    ).toBe(true);
    expect(allowPermission("fullscreen", `${OWN}/projects/2/deliverables/gantt`, OWN)).toBe(true);
  });

  it("refuses every other permission, even to the app's own pages", () => {
    for (const permission of ["media", "geolocation", "clipboard-read", "openExternal"]) {
      expect(allowPermission(permission, `${OWN}/`, OWN)).toBe(false);
    }
  });

  it("refuses another origin, another port of the same host, and malformed URLs", () => {
    for (const permission of ["notifications", "fullscreen"]) {
      expect(allowPermission(permission, "https://example.com/", OWN)).toBe(false);
      expect(allowPermission(permission, "http://127.0.0.1:3000/", OWN)).toBe(false);
      expect(allowPermission(permission, "file:///C:/splash.html", OWN)).toBe(false);
      expect(allowPermission(permission, "not a url", OWN)).toBe(false);
    }
  });
});
