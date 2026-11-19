# Desktop release checklist

How the Windows installer gets signed, checked and published for the client and for beta
testers. The rules behind it are in [ADR-0034](adr/ADR-0034-desktop-update-signing.md); the
build itself is in [DESKTOP.md](DESKTOP.md).

## One-time set-up

Buy and set up, in this order (identity validation takes the longest):

1. **Azure subscription**, pay-as-you-go. Artifact Signing does not run on free, trial or
   sponsored subscriptions.
2. **Artifact Signing account** (Microsoft's new name for Trusted Signing), Basic plan, about
   USD 10 a month for 5,000 signatures. Note the region's endpoint,
   `https://<region>.codesigning.azure.net/`, and the account name.
3. **Identity validation**, Public Trust, as the organisation (registered in the US, Canada,
   the EU or the UK). Microsoft's pages disagree on whether three years of verifiable history
   are required, so confirm with Azure support before relying on it. If validation is refused,
   use the OV fallback below.
4. **Certificate profile**, Public Trust, on that validated identity. Note the profile name and
   the certificate subject it shows (`CN=…, O=…, L=…, S=…, C=…`).
5. **App registration** in Microsoft Entra ID for CI, with a client secret that expires within
   12 months (put the renewal date in the calendar). Give it the *Artifact Signing Certificate
   Profile Signer* role on that one certificate profile, nothing wider.
6. **GitHub environment `desktop-release`** in every repository that releases (this one and
   the deploy repository). Under *Deployment branches*, allow `develop` only. Then add:
   - secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`;
   - variables `PM_AZURE_SIGN_ENDPOINT`, `PM_AZURE_SIGN_ACCOUNT`, `PM_AZURE_SIGN_PROFILE`, and
     `PM_PUBLISHER` (the subject from step 4, copied exactly).
   Repository-level secrets do not reach the release job: `ci.yml` passes none to it.
7. **Public update folder for testers** (`PM_UPDATE_URL`, an environment variable): an HTTPS
   folder on our own domain that answers HTTP range requests and needs no sign-in. GitHub Pages
   cannot hold the ~400 MB installer, so it needs a storage bucket or CDN behind the domain.
   Builds with this variable update from that folder instead of GitHub Releases.
8. **Accounts for the scans**: a Microsoft account for the Defender developer submission, and
   a VirusTotal account.

The first signed build checks itself: the release job refuses to publish an installer whose
signer is not `PM_PUBLISHER` or that has no timestamp.

### OV certificate fallback

If Artifact Signing is not available to the company: buy an OV code-signing certificate from a
CA with cloud key storage (SSL.com eSigner, DigiCert KeyLocker, Certum SimplySign, Sectigo),
roughly USD 200-500 a year. Since 2023 the key cannot be exported to a PFX, so:

1. Add the CA's own step to `desktop-release.yml` before *Build installer*: it installs the
   CA's signing tool and signs it in (the CA's credentials as environment secrets), which puts
   the certificate in the runner's store with its key held by the CA.
2. Set `PM_SIGN_CERT_SHA1` (the certificate's thumbprint) and `PM_PUBLISHER`; leave the
   `PM_AZURE_SIGN_*` variables empty. Exactly one method may be set; the build refuses two.

## Is a bridging release needed?

An installed app accepts an update only if its signer matches a subject the app was built
with. Before switching to a new subject, find out what the installed apps expect:

- On a PC, the app log says `[updater] installer signatures are verified against …`, or
  `releases are unsigned`.
- As of 2026-11-17, this repository never had signing set up (no `WIN_CSC_*` secrets, no
  `PM_PUBLISHER`, no `build-resources/publisher.cer`). Its installed apps verify nothing and
  take the first publicly signed release directly: **no bridge**. Check the deploy repository
  the same way; only if it ever signed with `WIN_CSC_LINK` do its PCs need the bridge.

When the installed apps do expect another subject (a self-issued certificate, a later move to
the OV fallback, or a changed company name or address):

1. **Bridging release**: sign it the old way (old method, `PM_PUBLISHER` = old subject) and
   set `PM_NEXT_PUBLISHER` to the new subject. Mark it required (`[force-update]` in the PR
   title), so each app installs it within minutes of starting.
2. **Wait until every PC runs it.** An app still on an older version refuses anything signed
   by the new certificate and shows "Update not installed"; that PC then needs the latest
   installer run by hand (data stays).
3. **Next release**: switch the variables to the new method and subject, and delete
   `PM_NEXT_PUBLISHER` and the old method's secrets. When leaving the self-issued certificate,
   also delete `build-resources/publisher.cer` and the `WIN_CSC_*` secrets. New installs then
   import nothing.
4. **Retire the old key.** The self-issued certificate stays in `LocalMachine\Root` and
   `TrustedPublisher` on PCs that imported it. An administrator removes it (use its thumbprint),
   then the PFX is destroyed:

   ```powershell
   Get-ChildItem Cert:\LocalMachine\Root, Cert:\LocalMachine\TrustedPublisher |
     Where-Object Thumbprint -eq '<old thumbprint>' | Remove-Item
   ```

## Every release

The release job does these by itself: it signs every exe, DLL and native module with an
RFC 3161 timestamp (a file that fails to sign fails the build), checks the installer's signer
and timestamp, writes the `.sha256`, and publishes the GitHub Release. Then, by hand:

A build enforces licensing only when the repository variable `PM_LICENSING` is `enforce`; it then
needs `PM_LICENCE_PUBLIC_KEYS` and `PM_LICENCE_SERVICE_URL` set, or the build stops. Leave
`PM_LICENSING` empty on the client's repository.

No build whose `package.json` sets `"licensing": "enforce"` may reach the client's update feed
(PM2026) until every one of the client's installs holds a full licence. Until then their builds
leave the setting out, so licensing stays off.

1. **Signature**: the job's *Verify installer signature* step passed. On a PC, after installing:

   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\Programs\Modulus" -Recurse -Include *.exe,*.dll,*.node |
     Get-AuthenticodeSignature | Where-Object Status -ne 'Valid'
   ```

   prints nothing.
2. **Checksum**: `Get-FileHash .\Modulus-Setup-<version>.exe` equals the `.sha256` file.
3. **Tester folder** (when `PM_UPDATE_URL` is set): upload the installer, `.blockmap` and
   `.sha256` first and `latest.yml` **last**, so no app reads a `latest.yml` whose installer is
   not there yet.
4. **Microsoft Defender**: submit the installer at the Microsoft Security Intelligence file
   submission site as a *software developer*, stating it should not be detected. Wait for the
   result before inviting testers to that version.
5. **VirusTotal**: upload the public installer only. Uploads are shared with security vendors
   and can be downloaded by them, so never upload internal builds, logs, databases or anything
   with client data. Link the report on the download page. If an engine flags it, report a false
   positive to that vendor before inviting testers.
6. **Download page**: link the installer over HTTPS from our own domain, with its SHA-256
   (from the `.sha256` file) next to it, and the note that the one-time database set-up asks
   for administrator approval. That prompt is for *Windows PowerShell* (publisher Microsoft
   Windows), because PowerShell runs the set-up: say so, so testers expect it.
7. **Smoke install** on clean, standard-user Windows 10 and Windows 11 VMs (restore a snapshot
   each time): download and run the installer, note what SmartScreen shows, check that the
   downloaded installer's security warning and *Properties → Digital Signatures* name our
   company, then first sign-in and an update from the previous release. The installer itself
   needs no administrator (per-user). On Windows 11, run it once with Smart App Control on.
   Then, on the same VM:
   - The installed app starts its server (the sign-in page loads) and the grammar checker
     marks a misspelt word.
   - A copy of the install folder whose `resources\app.asar` has one byte changed refuses to
     start.
   - `resources\standalone\server.js` runs as the app's Node child with the fuses set: with
     `ELECTRON_RUN_AS_NODE=1`, `Modulus.exe resources\standalone\server.js` serves a page, and
     `NODE_OPTIONS` set on that command changes nothing.
   - With an enforcing build: start a trial with a test email, then set the PC's clock back two
     days and restart. The trial's days left do not grow, and editing still works or the app
     asks to reconnect; it never starts a new trial.
   - Uninstall, reinstall and start again with the same email: the app shows the same trial,
     not a fresh 14 days.
   - Disconnect the network for more than a day (or set the clock forward two days): the app
     asks to reconnect, viewing and export still work, saving a change is refused.
   - With a build that leaves `licensing` out, nothing about a licence appears and every change
     saves.

## Rotation and incidents

- **Client secret**: before it expires, add a new one to the app registration, replace
  `AZURE_CLIENT_SECRET`, run a release, then delete the old one.
- **Artifact Signing certificates** renew by themselves every few days; the subject stays the
  same while the validated identity does. A changed legal name or address changes the subject:
  that needs a bridging release.
- **Signing identity misused** (a secret leaked, an unexpected signature): remove the role
  assignment or disable the app registration at once, rotate the secret, and ask Microsoft to
  revoke the affected certificates.
