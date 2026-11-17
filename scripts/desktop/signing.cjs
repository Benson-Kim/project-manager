// Code-signing inputs for the desktop build (ADR-0034), kept pure for the unit test
// (scripts/desktop/tests/signing.test.mjs). A signed build writes the publisher subjects into
// resources/app-update.yml, and from then on every installed app refuses an update whose
// Authenticode signature does not chain to a root the PC trusts with one of those subjects.
// Signature and subjects travel together: a signed build without them leaves updates
// unverified, and subjects without a signature make every installed app refuse the update.

const path = require("path");

const SIGNING_ENV = {
  "trusted-signing": ["PM_AZURE_SIGN_ENDPOINT", "PM_AZURE_SIGN_ACCOUNT", "PM_AZURE_SIGN_PROFILE"],
  "certificate-store": ["PM_SIGN_CERT_SHA1"],
  pfx: ["CSC_LINK", "WIN_CSC_LINK"],
};

const AZURE_TIMESTAMP = "http://timestamp.acs.microsoft.com";
const CA_TIMESTAMP = "http://timestamp.digicert.com";

// Every exe, DLL and native Node module the installer carries, except the SQL Server media:
// provision.ps1 refuses to run it unless Microsoft's own signature is on it.
const SIGN_EXTS = [".dll", ".node", "!SQLEXPR_x64_ENU.exe"];

// The parser electron-updater itself uses to compare a subject with the installer's signer.
const { parseDn } = require(
  require.resolve("builder-util-runtime", {
    paths: [path.dirname(require.resolve("electron-updater/package.json"))],
  }),
);

const value = (env, key) => (env[key] || "").trim();

function httpsHost(text) {
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.hostname : "";
  } catch {
    return "";
  }
}

function chosenMethod(env) {
  const set = Object.entries(SIGNING_ENV).filter(([, keys]) => keys.some((k) => value(env, k)));
  if (set.length > 1) {
    throw new Error(
      `More than one signing method is configured (${set.map(([m]) => m).join(", ")}): ` +
        "set the variables of exactly one.",
    );
  }
  return set.length ? set[0][0] : null;
}

function requireSubject(key, subject, keys) {
  const dn = parseDn(subject);
  const missing = keys.filter((k) => !dn.get(k));
  if (missing.length) {
    throw new Error(
      `${key} must be the certificate's full subject, including ${missing.join(", ")} ` +
        "(e.g. 'CN=Example Ltd, O=Example Ltd, L=City, S=State, C=US'): installed apps " +
        "compare every part it names with the installer's signer.",
    );
  }
}

function trustedSigningOptions(env, publisher) {
  const missing = SIGNING_ENV["trusted-signing"].filter((k) => !value(env, k));
  if (missing.length) {
    throw new Error(`Trusted Signing needs ${missing.join(", ")} as well.`);
  }
  const endpoint = value(env, "PM_AZURE_SIGN_ENDPOINT");
  if (!httpsHost(endpoint).endsWith(".codesigning.azure.net")) {
    throw new Error(
      "PM_AZURE_SIGN_ENDPOINT must be the account's https://<region>.codesigning.azure.net/ " +
        "endpoint: the signing token is sent there.",
    );
  }
  return {
    azureSignOptions: {
      publisherName: publisher,
      endpoint,
      codeSigningAccountName: value(env, "PM_AZURE_SIGN_ACCOUNT"),
      certificateProfileName: value(env, "PM_AZURE_SIGN_PROFILE"),
      fileDigest: "SHA256",
      timestampRfc3161: AZURE_TIMESTAMP,
      timestampDigest: "SHA256",
    },
  };
}

function signtoolOptions(env, method) {
  if (env.ELECTRON_BUILDER_OFFLINE === "true") {
    throw new Error(
      "ELECTRON_BUILDER_OFFLINE=true signs without a timestamp: every signature would stop " +
        "being valid when the certificate expires, and installed apps would refuse the update.",
    );
  }
  const options = { signingHashAlgorithms: ["sha256"], rfc3161TimeStampServer: CA_TIMESTAMP };
  if (method === "pfx") return { signtoolOptions: options };
  const thumbprint = value(env, "PM_SIGN_CERT_SHA1").replace(/\s/g, "").toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(thumbprint)) {
    throw new Error("PM_SIGN_CERT_SHA1 must be the certificate's 40-hex-digit thumbprint.");
  }
  return { signtoolOptions: { ...options, certificateSha1: thumbprint } };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {boolean} certificateShipped build-resources/publisher.cer exists (the self-issued
 *   certificate provision.ps1 trusts on the PC, used only while the PFX method signs)
 * @returns {{
 *   method: "trusted-signing" | "certificate-store" | "pfx" | null,
 *   signed: boolean,
 *   publisherName: string[] | undefined,
 *   win: Record<string, unknown>,
 *   shipCertificate: boolean,
 * }}
 */
function signingConfig(env, certificateShipped) {
  const method = chosenMethod(env);
  const publisher = value(env, "PM_PUBLISHER");
  const next = value(env, "PM_NEXT_PUBLISHER");
  if (!method) {
    if (publisher || next) {
      throw new Error(
        "PM_PUBLISHER or PM_NEXT_PUBLISHER is set but no signing method is: an unsigned " +
          "installer carrying a publisher would be refused by every installed app.",
      );
    }
    return {
      method: null,
      signed: false,
      publisherName: undefined,
      win: { signExts: SIGN_EXTS },
      shipCertificate: false,
    };
  }
  if (!publisher) {
    throw new Error(
      "PM_PUBLISHER is required when signing: the certificate's subject is what installed " +
        "apps verify updates against.",
    );
  }
  const publicCa = method !== "pfx";
  requireSubject("PM_PUBLISHER", publisher, publicCa ? ["CN", "O", "C"] : ["CN"]);
  if (next) requireSubject("PM_NEXT_PUBLISHER", next, ["CN", "O", "C"]);
  return {
    method,
    signed: true,
    publisherName: next && next !== publisher ? [publisher, next] : [publisher],
    win: {
      forceCodeSigning: true,
      signExts: SIGN_EXTS,
      ...(method === "trusted-signing"
        ? trustedSigningOptions(env, publisher)
        : signtoolOptions(env, method)),
    },
    shipCertificate: !publicCa && certificateShipped,
  };
}

/**
 * electron-updater's own rule: every part the expected subject names must equal the signer's;
 * a bare name is compared with the signer's CN.
 */
function subjectMatches(signerSubject, expected) {
  const signer = parseDn(signerSubject);
  const want = parseDn(expected);
  if (!want.size) return expected === signer.get("CN");
  return [...want.keys()].every((key) => want.get(key) === signer.get(key));
}

module.exports = { signingConfig, subjectMatches, SIGN_EXTS, AZURE_TIMESTAMP, CA_TIMESTAMP };
