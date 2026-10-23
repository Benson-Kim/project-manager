import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { updateFeed, DEFAULT_UPDATE_REPO } = require("../update-feed.cjs");

describe("updateFeed", () => {
  it("defaults to this repo's GitHub Releases", () => {
    const [owner, repo] = DEFAULT_UPDATE_REPO.split("/");
    expect(updateFeed({})).toEqual([{ provider: "github", owner, repo, releaseType: "release" }]);
    expect(updateFeed({ PM_UPDATE_GITHUB: "acme/pm" })).toEqual([
      { provider: "github", owner: "acme", repo: "pm", releaseType: "release" },
    ]);
  });

  it("a self-hosted feed downloads each changed range on its own request", () => {
    expect(updateFeed({ PM_UPDATE_URL: "https://updates.example/pm/" })).toEqual([
      { provider: "generic", url: "https://updates.example/pm/", useMultipleRangeRequest: false },
    ]);
  });

  it("builds without a feed when switched off", () => {
    expect(updateFeed({ PM_UPDATE_FEED: "off", PM_UPDATE_URL: "https://updates.example/" })).toBe(
      null,
    );
  });

  it("refuses a GitHub feed that is not owner/repo", () => {
    expect(() => updateFeed({ PM_UPDATE_GITHUB: "acme" })).toThrow(/owner\/repo/);
  });
});
