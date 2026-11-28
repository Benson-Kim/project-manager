const BETA_APP_ID = "com.eliandigitalsolutions.modulus.beta";

/** @param {NodeJS.ProcessEnv} env */
function isBetaChannel(env) {
  const channel = (env.PM_CHANNEL || "").trim();
  if (channel !== "" && channel !== "beta") {
    throw new Error(`PM_CHANNEL must be empty or "beta", not "${channel}".`);
  }
  return channel === "beta";
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ enforce: boolean, version: string, full: boolean }} build
 */
function channelConfig(env, { enforce, version, full }) {
  const beta = isBetaChannel(env);
  if (enforce && !beta) {
    throw new Error('PM_LICENSING="enforce" is only allowed with PM_CHANNEL="beta".');
  }
  if (beta && !enforce) {
    throw new Error('PM_CHANNEL="beta" needs PM_LICENSING="enforce", so a beta build always expires.');
  }
  const productName = beta ? "Modulus Beta" : "Modulus";
  const installerName = `${beta ? "Modulus-Beta" : "Modulus"}-Setup-${full ? "Full-" : ""}${version}.exe`;
  const builderArgs = beta
    ? [
        `-c.appId=${BETA_APP_ID}`,
        `-c.productName="${productName}"`,
        `-c.nsis.shortcutName="${productName}"`,
        `-c.win.artifactName=${installerName}`,
      ]
    : [];
  // The package name names the updater's download cache, which a beta must not share.
  const manifest = beta ? { name: "modulus-beta", channel: "beta" } : {};
  const feedFile = beta ? "beta.yml" : "latest.yml";
  return { beta, productName, installerName, builderArgs, manifest, feedFile };
}

module.exports = { channelConfig, isBetaChannel };
