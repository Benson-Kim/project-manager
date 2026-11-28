// The update feed electron-builder writes into resources/app-update.yml, kept pure for the
// unit test (scripts/desktop/tests/update-feed.test.mjs).

const { isBetaChannel } = require("./channel.cjs");

const DEFAULT_UPDATE_REPO = "Benson-Kim/project-manager";

// The URL is written into every installer, where anyone can read it, and the app asks it
// with no credentials: a public HTTPS folder, never a signed or tokenised link.
function publicFeedUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "PM_UPDATE_URL must be a public https:// folder with no credentials, query or fragment: " +
        "it is readable in every installer.",
    );
  }
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {object[] | null} electron-builder `publish` entries; null builds without a feed
 */
function updateFeed(env) {
  if (env.PM_UPDATE_FEED === "off") return null;
  const beta = isBetaChannel(env);
  const folder = (env.PM_UPDATE_URL || "").trim();
  // The GitHub provider reads the newest release's latest.yml, which is the client feed.
  if (beta && !folder) {
    throw new Error('PM_CHANNEL="beta" needs PM_UPDATE_URL (the beta feed folder), or PM_UPDATE_FEED="off".');
  }
  if (folder) {
    // One request per changed range, as electron-updater does for GitHub. Its multi-range
    // download gives up 10 s after the response ends, while the unchanged blocks may still
    // be copying from the old installer: a slow PC then downloaded the full ~400 MB.
    const entry = { provider: "generic", url: publicFeedUrl(folder), useMultipleRangeRequest: false };
    return [beta ? { ...entry, channel: "beta" } : entry];
  }
  const [owner, repo] = (env.PM_UPDATE_GITHUB || DEFAULT_UPDATE_REPO).split("/");
  if (!owner || !repo) throw new Error("PM_UPDATE_GITHUB must look like owner/repo");
  return [{ provider: "github", owner, repo, releaseType: "release" }];
}

module.exports = { updateFeed, DEFAULT_UPDATE_REPO };
