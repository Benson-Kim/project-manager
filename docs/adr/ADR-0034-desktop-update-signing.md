# ADR-0034 — Desktop releases are signed and updates verified against the publisher

Status: Accepted · Date: 2026-10-16 · Revised 2026-11-17 (public certificate for the beta)
Session: whole-codebase review follow-up (open item: unsigned installer); revised for the public beta.
Extends the desktop update design in DESKTOP.md "Updates" and SECURITY.md "Vulnerability management".

## Context

The desktop installer is built by CI and published as a release; installed apps download the next
release and install it silently. The only integrity check was the sha512 in `latest.yml`, which
comes from the same release: anyone who can write a release (a compromised maintainer token, a
mistaken permission) could ship code that every PC installs by itself.

Authenticode gives the missing authenticity check, and electron-updater enforces it when the build
carries a `publisherName`: before installing, it runs `Get-AuthenticodeSignature` on the downloaded
installer and requires a **Valid** status (a chain to a root the PC trusts, intact, in date or
timestamped) **and** a signer whose subject matches one of the names, every part each name gives
compared. Proven on 2026-10-16: an installer signed with a self-issued certificate reads
`UnknownError` (refused) until the certificate is trusted, `HashMismatch` after one byte changes.

The 2026-10-16 decision used a self-issued certificate that provisioning imported into each PC's
`LocalMachine\Root`. That cannot stay for a public beta: asking strangers to trust our own root in
their machine store is exactly what makes careful people refuse to install. Findings on 2026-11-17:

- **Signing was never switched on.** No `WIN_CSC_*` secret, `PM_PUBLISHER` variable or
  `publisher.cer` exists in this repository, so every installed app verifies nothing today.
- **It could not have worked.** electron-builder 26 rejects `win.publisherName` (it moved under
  `signtoolOptions`/`azureSignOptions`; the schema refuses unknown keys), and `ci.yml` passes no
  repository secrets to the reusable release workflow, so `secrets.WIN_CSC_LINK` was always empty.
- **Since 2023 a CA certificate's key cannot leave hardware or a cloud HSM**, so a public
  certificate cannot be a PFX secret. EV no longer skips SmartScreen (2024), so it buys nothing.

## Decision

1. **A publicly trusted certificate signs every release.** First choice: **Microsoft Artifact
   Signing** (formerly Trusted Signing) through electron-builder's `win.azureSignOptions`, for an
   organisation registered in the US, Canada, the EU or the UK. Fallback: an **OV certificate**
   whose key a CA's cloud service holds, used through signtool by thumbprint
   (`signtoolOptions.certificateSha1`) after the CA's tool signs in on the runner. The self-issued
   PFX (`CSC_LINK`) remains only to sign a bridging release (decision 5).
2. **One method per build, chosen and checked in `scripts/desktop/signing.cjs`.** It refuses two
   methods at once, a method without `PM_PUBLISHER`, a publisher without a method, an incomplete
   Artifact Signing setting, an endpoint that is not `https://<region>.codesigning.azure.net/` (the
   signing token goes there), and a malformed thumbprint. A public certificate's subject must name
   at least CN, O and C, parsed by electron-updater's own parser: a bare CN would accept any
   certificate with that name from any public CA.
3. **Every signature is timestamped and every binary signed.** RFC 3161 timestamps
   (`timestamp.acs.microsoft.com` for Artifact Signing, whose certificates live a few days;
   `timestamp.digicert.com` for signtool), SHA-256 only, and signtool builds refuse
   `ELECTRON_BUILDER_OFFLINE` (it drops the timestamp). Every exe, DLL and `.node` module is
   signed, including the Next server's native modules outside the folders electron-builder walks,
   except the Microsoft-signed SQL Server media. `forceCodeSigning` makes a file that fails to sign
   fail the build, and CI's *Verify installer signature* step
   (`scripts/desktop/verify-signature.mjs`) refuses to publish an installer whose signer is not
   `PM_PUBLISHER` or that has no timestamp.
4. **Nothing is imported on the PC.** A public chain is already trusted, so a build signed by a
   public method ships no `publisher.cer` and `provision.ps1` imports nothing. Only a PFX build
   with `build-resources/publisher.cer` present still ships and imports it.
5. **A subject change goes through one bridging release.** The subjects are written to
   `app-update.yml` through the feed entry (`publish[].publisherName`, a list; Artifact Signing's
   own `publisherName` takes one string). `PM_NEXT_PUBLISHER` adds the next subject: the bridge is
   signed the old way and trusts both, every PC installs it (marked required), and only then does
   a release signed with the new certificate ship. The procedure is in RELEASE-CHECKLIST.md.
6. **A refused update is said, not only logged.** The updater logs every trusted subject at start,
   and when electron-updater refuses a downloaded installer's signature it logs an error and tells
   the user once per version that the update could not be verified and the latest installer is
   needed.
7. **Signing secrets live in the `desktop-release` GitHub environment**, limited to `develop`,
   where the reusable release job can read them and no other branch can. Artifact Signing signs in
   with an app registration that holds only the certificate-profile signer role.
8. **A public update feed for testers.** `PM_UPDATE_URL` (an environment variable) builds the
   app to update from a public HTTPS folder instead of GitHub Releases, since the deploy
   repository is private. `scripts/desktop/update-feed.cjs` refuses `http`, credentials, query
   strings and fragments: the URL is readable in every installer.
9. **Electron fuses are flipped before signing** (`electronFuses` in `electron-builder.config.cjs`):
   the app loads only from `app.asar`, whose hash is embedded in the signed executable and checked
   at start; `--inspect` arguments and `NODE_OPTIONS` are ignored. `runAsNode` stays on, because
   the Next server runs as a Node child of the same binary. Cookie encryption is unchanged.

## Consequences

- The fuses protect only `app.asar`: the main process, the grammar worker and the splash.
  The Next server (`resources/standalone`) and the setup scripts sit outside it, so anyone who can
  write to the per-user install folder can still change them. Their signed `.dll`/`.node` files
  show tampering to Smart App Control and Defender, but the JavaScript is not verified at start.

- Writing a release is not enough to put code on a PC: the signing identity is needed as well.
  With Artifact Signing that is an Entra app registration's secret in one GitHub environment;
  with the fallback, the CA account. Neither is in the repository.
- Testers install without trusting anything new. SmartScreen can still warn on a first install
  until the certificate builds reputation; the invite says so, and the download page carries the
  SHA-256.
- Today's installed apps verify nothing, so the first publicly signed release installs everywhere
  without a bridge. From that release on, a PC that skips a bridging release cannot update by
  itself: it shows "Update not installed" and needs the latest installer run by hand. Until it
  does, it downloads the refused version again at each check.
- Accepted gaps: electron-builder installs the `TrustedSigning` PowerShell module from the
  PowerShell Gallery at sign time (minimum version, not pinned), and the signing secrets are in the
  environment of the whole build step, as the PFX secret was. Splitting the build so only the
  signing step sees them, and federated (OIDC) sign-in instead of a client secret, are the next
  hardening steps. OIDC was not taken now: it adds a sign-in action, and its short-lived token
  has to stay usable until the signing at the end of a long build, which needs proving on a real
  run first.
- Covered by `scripts/desktop/tests/signing.test.mjs` (every method, every refusal, and the whole
  builder configuration validated against electron-builder's own schema),
  `verify-signature.test.mjs`, `update-feed.test.mjs` and `electron/tests/update-publishers.test.ts`.
  The first real exercise is the first release after the Azure settings exist; the bridge
  procedure has not been needed in this repository.
