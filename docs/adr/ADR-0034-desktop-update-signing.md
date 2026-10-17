# ADR-0034 — Desktop releases are signed and updates verified against the publisher

Status: Accepted · Date: 2026-10-16 · Session: whole-codebase review follow-up (open item: unsigned installer)
Extends the desktop update design in DESKTOP.md "Updates" and SECURITY.md "Vulnerability management".

## Context

The desktop installer is built by CI and published as a GitHub Release; installed apps download
the next release and install it silently. The only integrity check was the sha512 in
`latest.yml`, which comes from the same release: anyone who can write a release (a compromised
maintainer token, a mistaken permission) could ship code that every client PC installs by
itself. No code-signing certificate exists, and buying one from a public CA needs an
organisation validation the office has not started.

Authenticode gives the missing authenticity check, and electron-updater already enforces it
when the build carries a `publisherName`: before installing, it runs
`Get-AuthenticodeSignature` on the downloaded installer and requires a **Valid** status (a
chain to a root the PC trusts) **and** the signer's subject to match the publisher. Proven on
this PC on 2026-10-16: an installer signed with a self-issued certificate reads `UnknownError`
(refused) until the certificate is trusted, `HashMismatch` after one byte is changed, and the
JSON the updater parses carries the subject.

## Decision

1. **A self-issued publisher certificate signs every release.** `scripts/desktop/make-publisher-cert.ps1`
   creates it once (RSA 3072, SHA-256, code-signing EKU only, no CA bit, 5 years): the PFX
   becomes the GitHub secrets `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`, its subject the
   repository variable `PM_PUBLISHER`, its public half `build-resources/publisher.cer`.
   `desktop-release.yml` passes the three to the build; electron-builder signs the installer
   (the Microsoft-signed SQL Server media keeps its own signature).
2. **Signature and publisher travel together.** `scripts/desktop/signing.cjs` refuses a
   certificate without `PM_PUBLISHER` (updates would stay unverified) and a publisher without a
   certificate (every installed app would refuse the next update). An unsigned build carries no
   `publisherName`, so it behaves as before.
3. **The PC trusts the publisher once, under elevation.** The installer ships `publisher.cer`
   in `resources/setup`; `provision.ps1` (first install and Repair, already elevated) adds it to
   `LocalMachine\Root` and `LocalMachine\TrustedPublisher` if it is not there. Trust-on-first-
   install: the first installer a PC runs is trusted by the person installing it (checked
   against the `.sha256` from the release), every later one by the signature. Trusting an
   end-entity certificate as a root trusts exactly that key for exactly code signing. A failed
   import is logged, never fatal: the app runs, updates wait for the next Repair.
4. **A public-CA certificate is the same mechanism.** Replace the two secrets and the variable
   with the CA's; drop the `.cer` (the chain is already trusted). SmartScreen's first-install
   warning, which only a CA certificate with reputation removes, is the one thing this ADR does
   not fix.

## Consequences

- Writing a GitHub release is no longer enough to put code on client PCs: the private key is
  needed as well, and it lives in GitHub secrets (release job only) and the office's secret
  store, not in the repository.
- Rotation or compromise: run the script again, replace secret, variable and `.cer`, release;
  PCs pick the new publisher up at their next Repair (an update signed by the new key is refused
  until then, which is the correct failure).
- Until the secrets exist the release job prints a warning and builds unsigned, exactly as
  today. The signed path is covered by the unit test for `signing.cjs` and the local proof
  above; its first real exercise is the first release after the secrets are set, and the
  `LocalMachine` import by the first Repair on a Windows PC (needs an administrator).
