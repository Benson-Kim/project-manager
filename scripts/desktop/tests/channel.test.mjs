import { describe, expect, it } from "vitest";
import { channelConfig } from "../channel.cjs";
import { updateFeed } from "../update-feed.cjs";

const client = { enforce: false, version: "1.2.3", full: false };
const beta = { ...client, enforce: true };

describe("channelConfig", () => {
  it("leaves a build with no channel as it was", () => {
    expect(channelConfig({}, client)).toEqual({
      beta: false,
      productName: "Modulus",
      installerName: "Modulus-Setup-1.2.3.exe",
      builderArgs: [],
      manifest: {},
      feedFile: "latest.yml",
    });
    expect(channelConfig({ PM_CHANNEL: " " }, { ...client, full: true }).installerName).toBe(
      "Modulus-Setup-Full-1.2.3.exe",
    );
  });

  it("gives a beta build its own name, app id and installer", () => {
    expect(channelConfig({ PM_CHANNEL: "beta" }, beta)).toEqual({
      beta: true,
      productName: "Modulus Beta",
      installerName: "Modulus-Beta-Setup-1.2.3.exe",
      builderArgs: [
        "-c.appId=com.eliandigitalsolutions.modulus.beta",
        '-c.productName="Modulus Beta"',
        '-c.nsis.shortcutName="Modulus Beta"',
        "-c.win.artifactName=Modulus-Beta-Setup-1.2.3.exe",
      ],
      manifest: { name: "modulus-beta", channel: "beta" },
      feedFile: "beta.yml",
    });
    expect(channelConfig({ PM_CHANNEL: "beta" }, { ...beta, full: true }).installerName).toBe(
      "Modulus-Beta-Setup-Full-1.2.3.exe",
    );
  });

  it("refuses enforcement outside the beta channel", () => {
    expect(() => channelConfig({}, beta)).toThrow('only allowed with PM_CHANNEL="beta"');
  });

  it("refuses a beta build that would never expire", () => {
    expect(() => channelConfig({ PM_CHANNEL: "beta" }, client)).toThrow('needs PM_LICENSING="enforce"');
  });

  it("refuses an unknown channel", () => {
    expect(() => channelConfig({ PM_CHANNEL: "Beta" }, beta)).toThrow('empty or "beta"');
  });
});

describe("update feed per channel", () => {
  const url = "https://example.com/beta";

  it("gives client builds the same feed with or without an empty channel", () => {
    for (const env of [{}, { PM_UPDATE_URL: url }, { PM_UPDATE_GITHUB: "owner/repo" }]) {
      expect(JSON.stringify(updateFeed({ ...env, PM_CHANNEL: " " }))).toBe(JSON.stringify(updateFeed(env)));
      expect(updateFeed(env)[0]).not.toHaveProperty("channel");
    }
  });

  it("points a beta build at its own feed file", () => {
    expect(updateFeed({ PM_CHANNEL: "beta", PM_UPDATE_URL: url })).toEqual([
      { provider: "generic", url: `${url}/`, useMultipleRangeRequest: false, channel: "beta" },
    ]);
  });

  it("never lets a beta build fall back to the client feed", () => {
    expect(() => updateFeed({ PM_CHANNEL: "beta" })).toThrow("needs PM_UPDATE_URL");
    expect(() => updateFeed({ PM_CHANNEL: "beta", PM_UPDATE_GITHUB: "owner/repo" })).toThrow("needs PM_UPDATE_URL");
  });

  it("allows a beta build with no feed", () => {
    expect(updateFeed({ PM_CHANNEL: "beta", PM_UPDATE_FEED: "off" })).toBeNull();
  });
});
