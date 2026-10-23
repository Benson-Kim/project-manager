// The update feed electron-builder writes into resources/app-update.yml, kept pure for the
// unit test (scripts/desktop/tests/update-feed.test.mjs).

const DEFAULT_UPDATE_REPO = "Benson-Kim/project-manager";

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {object[] | null} electron-builder `publish` entries; null builds without a feed
 */
function updateFeed(env) {
  if (env.PM_UPDATE_FEED === "off") return null;
  if (env.PM_UPDATE_URL) {
    // One request per changed range, as electron-updater does for GitHub. Its multi-range
    // download gives up 10 s after the response ends, while the unchanged blocks may still
    // be copying from the old installer: a slow PC then downloaded the full ~400 MB.
    return [{ provider: "generic", url: env.PM_UPDATE_URL, useMultipleRangeRequest: false }];
  }
  const [owner, repo] = (env.PM_UPDATE_GITHUB || DEFAULT_UPDATE_REPO).split("/");
  if (!owner || !repo) throw new Error("PM_UPDATE_GITHUB must look like owner/repo");
  return [{ provider: "github", owner, repo, releaseType: "release" }];
}

module.exports = { updateFeed, DEFAULT_UPDATE_REPO };
