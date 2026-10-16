# One-time: create the publisher certificate that signs desktop releases (ADR-0034).
#
#   powershell -ExecutionPolicy Bypass -File scripts/desktop/make-publisher-cert.ps1 `
#     -Subject "CN=Burton Project Manager, O=Burton" -OutDir C:\secure\pm-signing
#
# Writes, in OutDir:
#   publisher.pfx  private key, password-protected. Never in the repo. Its base64 form
#                  becomes the GitHub secret WIN_CSC_LINK; the password WIN_CSC_KEY_PASSWORD.
#   publisher.cer  public certificate. Commit it as build-resources/publisher.cer: the
#                  installer ships it and provision.ps1 trusts it on each PC, once.
# and prints the repository variable PM_PUBLISHER (the subject, verified by every app).
#
# A certificate from a public CA works the same way (skip this script, set the three
# values from the CA's PFX, no .cer to ship). Rotation: run again, replace the secret,
# the variable and the .cer; PCs pick the new publisher up at their next Repair.
param(
  [Parameter(Mandatory = $true)] [string] $Subject,
  [string] $OutDir = '.',
  [int] $Years = 5
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$pfxPath = Join-Path $OutDir 'publisher.pfx'
$cerPath = Join-Path $OutDir 'publisher.cer'
if ((Test-Path -LiteralPath $pfxPath) -or (Test-Path -LiteralPath $cerPath)) {
  throw "Refusing to overwrite ${pfxPath} / ${cerPath}: move the old certificate away first."
}

# End-entity certificate (no CA bit) whose only use is code signing: trusting it as a root
# on a PC trusts exactly this key for exactly that purpose.
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject `
  -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears($Years) -CertStoreLocation Cert:\CurrentUser\My

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes)
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
# The PFX is the copy to keep; the key does not stay in this account's store.
Get-ChildItem Cert:\CurrentUser\My | Where-Object Thumbprint -eq $cert.Thumbprint | Remove-Item

Write-Output ''
Write-Output "Publisher certificate created (valid until $($cert.NotAfter.ToString('yyyy-MM-dd')), thumbprint $($cert.Thumbprint))."
Write-Output "  $pfxPath   (private key: keep it with the office's other secrets)"
Write-Output "  $cerPath   (public: commit as build-resources/publisher.cer)"
Write-Output ''
Write-Output 'GitHub repository settings:'
Write-Output "  secret   WIN_CSC_LINK          = base64 of publisher.pfx ([Convert]::ToBase64String([IO.File]::ReadAllBytes('$pfxPath')))"
Write-Output "  secret   WIN_CSC_KEY_PASSWORD  = $password"
Write-Output "  variable PM_PUBLISHER          = $($cert.Subject)"
