// Release gate (ADR-0034): the installer just built must carry the signature installed apps
// will accept — intact, timestamped, from PM_PUBLISHER — before it is published.
//
//   node scripts/desktop/verify-signature.mjs dist-installer/Modulus-Setup-1.2.3.exe

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { subjectMatches } = require("./signing.cjs");

/**
 * @param {{ Status: string, Subject: string | null, Issuer: string | null, Timestamped: boolean }} sig
 * @param {string} publisher
 * @returns {string[]} what is wrong; empty when installed apps will accept it
 */
export function signatureProblems(sig, publisher) {
  if (!sig.Subject) return [`not signed (${sig.Status})`];
  const problems = [];
  // The self-issued certificate is trusted only on PCs provision.ps1 set up, not here.
  const selfIssued = sig.Issuer === sig.Subject;
  const chainOnly = selfIssued && ["UnknownError", "NotTrusted"].includes(sig.Status);
  if (sig.Status !== "Valid" && !chainOnly) problems.push(`signature status ${sig.Status}`);
  if (!subjectMatches(sig.Subject, publisher)) {
    problems.push(`signed by "${sig.Subject}", installed apps expect "${publisher}"`);
  }
  if (!sig.Timestamped) {
    problems.push("no RFC 3161 timestamp: the signature dies with the certificate");
  }
  return problems;
}

function readSignature(file) {
  const literal = resolve(file).replace(/'/g, "''");
  const script =
    `Get-AuthenticodeSignature -LiteralPath '${literal}' | Select-Object ` +
    "@{n='Status';e={[string]$_.Status}}, " +
    "@{n='Subject';e={$_.SignerCertificate.Subject}}, " +
    "@{n='Issuer';e={$_.SignerCertificate.Issuer}}, " +
    "@{n='Timestamped';e={$null -ne $_.TimeStamperCertificate}} | ConvertTo-Json -Compress";
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  return JSON.parse(out);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isMain) {
  const argv = process.argv.slice(2);
  const allowUnsigned = argv.includes("--allow-unsigned");
  const [file] = argv.filter((a) => !a.startsWith("--"));
  const publisher = (process.env.PM_PUBLISHER || "").trim();
  if (!file) {
    console.error("usage: node scripts/desktop/verify-signature.mjs [--allow-unsigned] <installer.exe>");
    process.exit(2);
  }
  if (!publisher) {
    if (!allowUnsigned) {
      console.error(
        "::error::No PM_PUBLISHER: this installer would be published unsigned and installed apps would refuse it. Configure signing, or deliberately set PM_ALLOW_UNSIGNED_RELEASE=true for this release.",
      );
      process.exit(1);
    }
    console.log("::warning::Unsigned release allowed on purpose (PM_ALLOW_UNSIGNED_RELEASE): nothing to verify.");
    process.exit(0);
  }
  const problems = signatureProblems(readSignature(file), publisher);
  if (problems.length) {
    for (const p of problems) console.error(`::error::${file}: ${p}`);
    process.exit(1);
  }
  console.log(`${file}: signed by ${publisher}, timestamped.`);
}
