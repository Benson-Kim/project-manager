// Code-signing inputs for the desktop build (ADR-0034), kept pure for the unit test
// (scripts/desktop/tests/signing.test.mjs). electron-builder signs the installer when
// CSC_LINK (or WIN_CSC_LINK) names a certificate; the publisher's subject goes into
// resources/app-update.yml as publisherName, and from then on every installed app
// refuses an update whose Authenticode signature does not carry that subject on a
// trusted chain. The two must travel together: a signed build without the publisher
// would leave updates unverified, and a publisher without a signature would make every
// installed app refuse the next update.

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {boolean} certificateShipped build-resources/publisher.cer exists (provision.ps1
 *   trusts it on the PC once, under elevation)
 * @returns {{ signed: boolean, publisherName: string[] | undefined, shipCertificate: boolean }}
 */
function signingConfig(env, certificateShipped) {
  const link = (env.CSC_LINK || env.WIN_CSC_LINK || "").trim();
  const publisher = (env.PM_PUBLISHER || "").trim();
  const signed = link !== "";
  if (signed && !publisher) {
    throw new Error(
      "PM_PUBLISHER is required when CSC_LINK is set: the certificate's subject " +
        "(e.g. 'CN=Burton Project Manager, O=Burton') is what installed apps verify updates against.",
    );
  }
  if (!signed && publisher) {
    throw new Error(
      "PM_PUBLISHER is set but there is no certificate (CSC_LINK): an unsigned installer " +
        "carrying a publisher name would be refused by every installed app.",
    );
  }
  return {
    signed,
    publisherName: signed ? [publisher] : undefined,
    shipCertificate: certificateShipped,
  };
}

module.exports = { signingConfig };
