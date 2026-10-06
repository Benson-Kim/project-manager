#Requires -Version 5.1
<#
.SYNOPSIS
  Project Manager - database engine provisioning. MUST run elevated.

.DESCRIPTION
  Called by the NSIS installer (build-resources/installer.nsh, customInstall)
  and by the app's "Repair" action. Idempotent: every step checks the real
  state and only changes what is missing, so it is safe to re-run at any time
  (fresh install, upgrade, or repair after a half-finished install).

    1. Install SQL Server Express instance PROJECTMGR (only if absent)
    2. TCP on 127.0.0.1:<Port> only (loopback) + firewall block rule
    3. Mixed-mode auth, service Automatic + running
    4. Dedicated login 'pm_app' (password kept in machine.json); 'sa' disabled
    5. Backups folder writable by the SQL Server service
    6. %ProgramData%\Project Manager\machine.json (atomic write)

  Secrets are never written to the log.

  Exit codes: 0 ok | 10 not elevated | 20 installer missing/untrusted |
              30 SQL setup failed | 40 service/network config failed |
              50 login/config failed | 1 unexpected error
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $SqlInstaller,
  [string] $InstanceName = 'PROJECTMGR',
  [int]    $Port = 14330,
  [string] $DataRoot = (Join-Path $env:ProgramData 'Project Manager')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$ServiceName = "MSSQL`$$InstanceName"
$ServiceSid = "NT SERVICE\MSSQL`$$InstanceName"
$LogDir = Join-Path $DataRoot 'logs'
$BackupDir = Join-Path $DataRoot 'Backups'
$ConfigPath = Join-Path $DataRoot 'machine.json'
$LogFile = Join-Path $LogDir 'provision.log'
$SqlRegRoot = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server'
$FirewallRuleName = 'ProjectManager-SQL-BlockInbound'

class ProvisionError : System.Exception {
  [int] $Code
  ProvisionError([int] $code, [string] $message) : base($message) { $this.Code = $code }
}

function Write-Log([string] $Message) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
  try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { }
  Write-Host $line
}

function New-Secret([int] $Length) {
  # Alphanumeric only: no quoting hazards on any command line or in T-SQL,
  # and upper+lower+digit satisfies SQL Server's complexity policy.
  $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; $lower = 'abcdefghijkmnpqrstuvwxyz'; $digits = '23456789'
  $all = $upper + $lower + $digits
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $pick = {
    param([string] $set)
    $b = New-Object byte[] 4
    do { $rng.GetBytes($b); $n = [BitConverter]::ToUInt32($b, 0) } while ($n -ge ([uint32]::MaxValue - ([uint32]::MaxValue % $set.Length)))
    $set[[int]($n % $set.Length)]
  }
  $chars = @((& $pick $upper), (& $pick $lower), (& $pick $digits))
  while ($chars.Count -lt $Length) { $chars += (& $pick $all) }
  -join $chars
}

function Get-InstanceRegistryId {
  $names = Get-ItemProperty -Path "$SqlRegRoot\Instance Names\SQL" -ErrorAction SilentlyContinue
  if ($null -eq $names) { return $null }
  $prop = $names.PSObject.Properties[$InstanceName]
  if ($null -eq $prop) { return $null }
  return [string] $prop.Value
}

function Set-RegValueIfDifferent([string] $Path, [string] $Name, $Value) {
  $current = (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction SilentlyContinue)
  $currentValue = if ($null -ne $current) { $current.$Name } else { $null }
  if ("$currentValue" -ne "$Value") {
    Set-ItemProperty -LiteralPath $Path -Name $Name -Value $Value
    return $true
  }
  return $false
}

function Test-TcpPort([int] $TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(2000) -and $client.Connected) { return $true }
    } catch { } finally { $client.Close() }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Invoke-Sql([string] $ConnectionString, [string] $Sql) {
  $conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
  try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 120
    $cmd.CommandText = $Sql
    return $cmd.ExecuteScalar()
  } finally { $conn.Dispose() }
}

function Write-Utf8NoBom([string] $Path, [string] $Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

# --------------------------------------------------------------------------
function Install-SqlExpress {
  if (-not (Test-Path -LiteralPath $SqlInstaller)) {
    throw [ProvisionError]::new(20, "SQL Server installer not found: $SqlInstaller")
  }
  $sig = Get-AuthenticodeSignature -LiteralPath $SqlInstaller
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw [ProvisionError]::new(20, "SQL Server installer signature is not a valid Microsoft signature ($($sig.Status)).")
  }

  # Extract to a path without spaces: the self-extractor's /x: switch is fragile with quotes.
  $extract = Join-Path $env:SystemRoot "Temp\PMSqlSetup"
  if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
  Write-Log "Extracting SQL Server Express to $extract ..."
  $p = Start-Process -FilePath $SqlInstaller -ArgumentList @('/Q', "/x:$extract") -Wait -PassThru
  $setup = Join-Path $extract 'SETUP.EXE'
  if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $setup)) {
    throw [ProvisionError]::new(30, "Extracting the SQL Server installer failed (exit $($p.ExitCode)).")
  }

  # Account names are localized on non-English Windows - resolve from well-known SIDs.
  $adminsGroup = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544').Translate([Security.Principal.NTAccount]).Value
  $installingUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $saPassword = New-Secret 32

  $arguments = @(
    '/Q', '/ACTION=Install', '/IACCEPTSQLSERVERLICENSETERMS', '/SUPPRESSPRIVACYSTATEMENTNOTICE',
    '/FEATURES=SQLENGINE', "/INSTANCENAME=$InstanceName",
    "/SQLSVCACCOUNT=`"$ServiceSid`"", '/SQLSVCSTARTUPTYPE=Automatic',
    "/SQLSYSADMINACCOUNTS=`"$adminsGroup`" `"$installingUser`"",
    '/SECURITYMODE=SQL', "/SAPWD=$saPassword",
    '/TCPENABLED=1', '/NPENABLED=0', '/BROWSERSVCSTARTUPTYPE=Disabled',
    '/UPDATEENABLED=False', '/SKIPRULES=RebootRequiredCheck'
  ) -join ' '

  Write-Log "Running SQL Server setup (instance $InstanceName). This takes several minutes..."
  Write-Log ("Setup arguments: " + ($arguments -replace '/SAPWD=\S+', '/SAPWD=***'))
  $p = Start-Process -FilePath $setup -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  $exit = $p.ExitCode
  Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue

  if ($exit -ne 0 -and $exit -ne 3010) {
    $summary = Get-ChildItem -Path "$env:ProgramFiles\Microsoft SQL Server\*\Setup Bootstrap\Log\Summary.txt" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($summary) {
      Write-Log "SQL Server setup summary ($($summary.FullName)):"
      Get-Content -LiteralPath $summary.FullName -TotalCount 40 | ForEach-Object { Write-Log "  $_" }
    }
    throw [ProvisionError]::new(30, "SQL Server setup failed with exit code $exit.")
  }
  if ($exit -eq 3010) { Write-Log 'SQL Server setup finished; Windows reports a restart is recommended.' }
  Write-Log 'SQL Server Express installed.'
}

# --------------------------------------------------------------------------
function Set-NetworkConfiguration([string] $InstanceId) {
  $tcp = "$SqlRegRoot\$InstanceId\MSSQLServer\SuperSocketNetLib\Tcp"
  $np = "$SqlRegRoot\$InstanceId\MSSQLServer\SuperSocketNetLib\Np"
  $changed = $false
  $changed = (Set-RegValueIfDifferent $tcp 'Enabled' 1) -or $changed
  if (Test-Path -LiteralPath $np) { $changed = (Set-RegValueIfDifferent $np 'Enabled' 0) -or $changed }

  $ipKeys = @(Get-ChildItem -LiteralPath $tcp | Where-Object { $_.PSChildName -like 'IP*' -and $_.PSChildName -ne 'IPAll' })
  $loopback = $ipKeys | Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).PSObject.Properties['IpAddress'] -and (Get-ItemProperty -LiteralPath $_.PSPath).IpAddress -eq '127.0.0.1' } | Select-Object -First 1

  if ($loopback) {
    # Listen on 127.0.0.1 only: the database is unreachable from the network.
    $changed = (Set-RegValueIfDifferent $tcp 'ListenOnAllIPs' 0) -or $changed
    foreach ($k in $ipKeys) {
      if ($k.PSChildName -eq $loopback.PSChildName) {
        $changed = (Set-RegValueIfDifferent $k.PSPath 'Enabled' 1) -or $changed
        $changed = (Set-RegValueIfDifferent $k.PSPath 'TcpPort' "$Port") -or $changed
        $changed = (Set-RegValueIfDifferent $k.PSPath 'TcpDynamicPorts' '') -or $changed
      } else {
        $changed = (Set-RegValueIfDifferent $k.PSPath 'Enabled' 0) -or $changed
      }
    }
    Write-Log "TCP: listening on 127.0.0.1:$Port only."
  } else {
    # No loopback entry (unusual) - listen on the fixed port; the firewall rule below blocks remote access.
    $changed = (Set-RegValueIfDifferent $tcp 'ListenOnAllIPs' 1) -or $changed
    $changed = (Set-RegValueIfDifferent "$tcp\IPAll" 'TcpPort' "$Port") -or $changed
    $changed = (Set-RegValueIfDifferent "$tcp\IPAll" 'TcpDynamicPorts' '') -or $changed
    Write-Log "TCP: no loopback entry found; listening on all addresses, port $Port (firewall-blocked)."
  }

  # Mixed-mode authentication (SQL logins) is required by the app.
  $changed = (Set-RegValueIfDifferent "$SqlRegRoot\$InstanceId\MSSQLServer" 'LoginMode' 2) -or $changed
  return $changed
}

function Set-FirewallRule {
  try {
    $existing = Get-NetFirewallRule -Name $FirewallRuleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -Name $FirewallRuleName -DisplayName 'Project Manager database (block network access)' `
        -Direction Inbound -Action Block -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
      Write-Log "Firewall: inbound TCP $Port blocked."
    }
  } catch {
    Write-Log "WARNING: could not create firewall rule ($($_.Exception.Message)). The engine still listens on loopback only."
  }
}

function Start-SqlService([bool] $Restart) {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) { throw [ProvisionError]::new(40, "Service $ServiceName not found after install.") }
  if ($svc.StartType -ne 'Automatic') { Set-Service -Name $ServiceName -StartupType Automatic }
  if ($Restart -and $svc.Status -eq 'Running') {
    Write-Log "Restarting $ServiceName to apply configuration..."
    Restart-Service -Name $ServiceName -Force
  } elseif ($svc.Status -ne 'Running') {
    Write-Log "Starting $ServiceName..."
    Start-Service -Name $ServiceName
  }
  if (-not (Test-TcpPort 120)) {
    throw [ProvisionError]::new(40, "SQL Server is not accepting connections on 127.0.0.1:$Port.")
  }
  Write-Log 'SQL Server is accepting connections.'
}

function Set-AccessControl {
  foreach ($d in @($DataRoot, $LogDir, $BackupDir)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  }
  # Root: SYSTEM + Administrators full, Users read (machine.json holds the DB password).
  & icacls.exe $DataRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw [ProvisionError]::new(50, "icacls failed on $DataRoot") }
  # Backups: the app (any local user) copies/prunes; the SQL service writes .bak files.
  & icacls.exe $BackupDir /grant '*S-1-5-32-545:(OI)(CI)M' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw [ProvisionError]::new(50, "icacls failed on $BackupDir") }
}

function Grant-ServiceBackupAccess {
  & icacls.exe $BackupDir /grant "${ServiceSid}:(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw [ProvisionError]::new(50, "Could not grant $ServiceSid access to $BackupDir") }
}

function Read-ExistingConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
  try { return (Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { Write-Log "WARNING: existing machine.json is unreadable; it will be rewritten."; return $null }
}

# --------------------------------------------------------------------------
$exitCode = 0
try {
  if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  Write-Log "=== Provisioning start (instance $InstanceName, port $Port) ==="

  $principal = New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw [ProvisionError]::new(10, 'Provisioning must run as administrator.')
  }

  Set-AccessControl

  if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    Install-SqlExpress
  } else {
    Write-Log "Instance $InstanceName already installed."
  }

  $instanceId = Get-InstanceRegistryId
  if (-not $instanceId) { throw [ProvisionError]::new(40, "Instance $InstanceName is not registered in the SQL Server registry.") }
  $changed = Set-NetworkConfiguration $instanceId
  Set-FirewallRule
  Start-SqlService $changed
  Grant-ServiceBackupAccess

  # Logins: connect as the elevated Windows administrator (sysadmin via BUILTIN\Administrators).
  $existing = Read-ExistingConfig
  $appPassword = $null
  if ($existing -and $existing.PSObject.Properties['sql'] -and $existing.sql.password -match '^[A-Za-z0-9]{24,}$') {
    $appPassword = $existing.sql.password
  } else {
    $appPassword = New-Secret 32
  }
  $authSecret = $null
  if ($existing -and $existing.PSObject.Properties['authSecret'] -and "$($existing.authSecret)".Length -ge 32) {
    $authSecret = $existing.authSecret
  } else {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $authSecret = [Convert]::ToBase64String($bytes)
  }

  $adminCs = "Server=tcp:127.0.0.1,$Port;Database=master;Integrated Security=SSPI;Connect Timeout=30"
  $saPassword = New-Secret 32
  $loginSql = @"
SET NOCOUNT ON;
IF SUSER_ID(N'pm_app') IS NULL
    CREATE LOGIN [pm_app] WITH PASSWORD = N'$appPassword', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [master];
ELSE
    ALTER LOGIN [pm_app] WITH PASSWORD = N'$appPassword', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
ALTER LOGIN [pm_app] ENABLE;
IF IS_SRVROLEMEMBER(N'sysadmin', N'pm_app') = 0 ALTER SERVER ROLE [sysadmin] ADD MEMBER [pm_app];
ALTER LOGIN [sa] WITH PASSWORD = N'$saPassword';
ALTER LOGIN [sa] DISABLE;
SELECT 1;
"@
  try {
    Invoke-Sql $adminCs $loginSql | Out-Null
  } catch {
    throw [ProvisionError]::new(50, "Configuring SQL logins failed: $($_.Exception.Message)")
  }
  Write-Log "Login 'pm_app' configured; 'sa' disabled."

  $config = [ordered]@{
    schemaVersion    = 1
    sql              = [ordered]@{
      instanceName = $InstanceName
      host         = '127.0.0.1'
      port         = $Port
      database     = 'ProjectManager'
      user         = 'pm_app'
      password     = $appPassword
    }
    authSecret       = $authSecret
    backupDir        = $BackupDir
    provisionedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $tmp = "$ConfigPath.tmp"
  Write-Utf8NoBom $tmp ($config | ConvertTo-Json -Depth 5)
  Move-Item -LiteralPath $tmp -Destination $ConfigPath -Force
  Write-Log "Wrote $ConfigPath"

  # Prove the app's own credentials work before declaring success.
  $appCs = "Server=tcp:127.0.0.1,$Port;Database=master;User ID=pm_app;Password=$appPassword;Connect Timeout=30"
  try { Invoke-Sql $appCs 'SELECT 1' | Out-Null } catch {
    throw [ProvisionError]::new(50, "The app login could not connect: $($_.Exception.Message)")
  }
  Write-Log '=== Provisioning complete ==='
} catch [ProvisionError] {
  $exitCode = $_.Exception.Code
  Write-Log "ERROR ($exitCode): $($_.Exception.Message)"
} catch {
  $exitCode = 1
  Write-Log "ERROR: $($_.Exception.Message)"
  Write-Log $_.ScriptStackTrace
}
exit $exitCode
