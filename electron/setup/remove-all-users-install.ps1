#Requires -Version 5.1
<#
.SYNOPSIS
  Removes a Project Manager copy installed "for all users" (C:\Program Files).

.DESCRIPTION
  Versions before 1.0.0 were installed for all users, which made every update
  ask for administrator approval. From 1.0.0 the app is installed per user;
  the installer (build-resources/installer.nsh) calls this script once to
  remove the old copy so only the new one remains.

  Keeps all data: the database, its backups, machine.json and the user's
  settings are not touched (the uninstaller runs with /KEEP_APP_DATA).
  Asks for administrator approval itself (one Windows prompt).

  Exit codes: 0 removed or nothing to remove | 11 administrator approval declined |
              other = the uninstaller's exit code, or 1 for an unexpected error
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $InstallDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$uninstaller = Join-Path $InstallDir 'Uninstall Project Manager.exe'
if (-not (Test-Path -LiteralPath $uninstaller)) { exit 0 }

$principal = New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argList = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallDir `"$InstallDir`""
  try {
    $p = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argList `
      -Verb RunAs -Wait -PassThru -WindowStyle Hidden
  } catch {
    exit 11 # administrator approval declined
  }
  exit $p.ExitCode
}

try {
  # Same call electron-builder uses for old versions: a copy of the uninstaller
  # (the original is deleted with the folder), run in place with _?= so that
  # waiting for it really waits for the uninstall. _?= must be the last argument.
  $copy = Join-Path ([IO.Path]::GetTempPath()) "pm-old-uninstaller-$PID.exe"
  Copy-Item -LiteralPath $uninstaller -Destination $copy -Force
  try {
    $p = Start-Process -FilePath $copy -ArgumentList "/S /KEEP_APP_DATA /allusers _?=$InstallDir" -Wait -PassThru
  } finally {
    Remove-Item -LiteralPath $copy -Force -ErrorAction SilentlyContinue
  }
  if ($p.ExitCode -ne 0) { exit $p.ExitCode }
  if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  exit 0
} catch {
  exit 1
}
