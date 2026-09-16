import { describe, expect, it } from "vitest";
import { guardedHref, type GuardAnchorLike, type GuardClickLike } from "./unsaved-guard";

const CURRENT = "https://app.example/projects/2";

function click(overrides: Partial<GuardClickLike> = {}): GuardClickLike {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

function anchor(
  href: string,
  { target = "", download = false }: { target?: string; download?: boolean } = {},
): GuardAnchorLike {
  return { href, target, hasAttribute: (name) => name === "download" && download };
}

describe("guardedHref", () => {
  it("intercepts a plain left click on an internal link", () => {
    expect(click().defaultPrevented).toBe(false);
    expect(guardedHref(click(), anchor("https://app.example/projects"), CURRENT)).toBe("/projects");
  });

  it("keeps query and hash of the destination", () => {
    expect(guardedHref(click(), anchor("https://app.example/projects?q=x#top"), CURRENT)).toBe(
      "/projects?q=x#top",
    );
  });

  it("ignores clicks without an anchor or already handled", () => {
    expect(guardedHref(click(), null, CURRENT)).toBeNull();
    expect(
      guardedHref(
        click({ defaultPrevented: true }),
        anchor("https://app.example/projects"),
        CURRENT,
      ),
    ).toBeNull();
  });

  it("ignores modified clicks and non-primary buttons (new tab/window intent)", () => {
    const dest = anchor("https://app.example/projects");
    expect(guardedHref(click({ metaKey: true }), dest, CURRENT)).toBeNull();
    expect(guardedHref(click({ ctrlKey: true }), dest, CURRENT)).toBeNull();
    expect(guardedHref(click({ shiftKey: true }), dest, CURRENT)).toBeNull();
    expect(guardedHref(click({ altKey: true }), dest, CURRENT)).toBeNull();
    expect(guardedHref(click({ button: 1 }), dest, CURRENT)).toBeNull();
  });

  it("ignores new-tab targets, downloads and external origins (beforeunload covers unloads)", () => {
    expect(
      guardedHref(click(), anchor("https://app.example/projects", { target: "_blank" }), CURRENT),
    ).toBeNull();
    expect(
      guardedHref(click(), anchor("https://app.example/file.pdf", { download: true }), CURRENT),
    ).toBeNull();
    expect(guardedHref(click(), anchor("https://other.example/projects"), CURRENT)).toBeNull();
  });

  it("ignores same-page and hash-only navigation", () => {
    expect(guardedHref(click(), anchor("https://app.example/projects/2"), CURRENT)).toBeNull();
    expect(guardedHref(click(), anchor("https://app.example/projects/2#charter"), CURRENT)).toBeNull();
  });
});
