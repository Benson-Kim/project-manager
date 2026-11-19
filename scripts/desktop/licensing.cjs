// Licensing settings for a desktop build, read from the release settings and kept pure for the
// unit test (scripts/desktop/tests/licensing.test.mjs).

const { createPublicKey } = require("node:crypto");

function licensingMode(text) {
  const mode = (text || "").trim();
  if (mode === "") return false;
  if (mode === "enforce") return true;
  throw new Error(`PM_LICENSING must be empty or "enforce", not "${mode}".`);
}

function ed25519PublicKey(kid, key) {
  let type;
  try {
    type = createPublicKey({ key: Buffer.from(key, "base64url"), format: "der", type: "spki" }).asymmetricKeyType;
  } catch {
    type = null;
  }
  if (typeof key !== "string" || type !== "ed25519") {
    throw new Error(
      `PM_LICENCE_PUBLIC_KEYS key "${kid}" must be a base64url SPKI Ed25519 public key, never a private key.`,
    );
  }
  return key;
}

function publicKeys(text) {
  const json = (text || "").trim();
  if (json === "") return {};
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('PM_LICENCE_PUBLIC_KEYS must be a JSON object of key id to public key, like {"k1":"MCow..."}.');
  }
  return Object.fromEntries(Object.entries(parsed).map(([kid, key]) => [kid, ed25519PublicKey(kid, key)]));
}

// The address is written into every installer, where anyone can read it.
function serviceUrl(text) {
  const value = (text || "").trim();
  if (value === "") return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("PM_LICENCE_SERVICE_URL must be an https:// address with no credentials, query or fragment.");
  }
  return url.href;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ enforce: boolean, publicKeys: Record<string, string>, serviceUrl: string }}
 */
function licensingConfig(env) {
  const enforce = licensingMode(env.PM_LICENSING);
  const config = {
    enforce,
    publicKeys: publicKeys(env.PM_LICENCE_PUBLIC_KEYS),
    serviceUrl: serviceUrl(env.PM_LICENCE_SERVICE_URL),
  };
  if (enforce) {
    const missing = [
      Object.keys(config.publicKeys).length === 0 ? "PM_LICENCE_PUBLIC_KEYS" : null,
      config.serviceUrl === "" ? "PM_LICENCE_SERVICE_URL" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`An enforcing build needs ${missing.join(" and ")} set in the release settings.`);
    }
  }
  return config;
}

module.exports = { licensingConfig };
