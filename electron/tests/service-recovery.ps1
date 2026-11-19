#Requires -Version 5.1
# Exercise the shipped Windows provisioning functions without changing any real service.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3
Add-Type -AssemblyName System.ServiceProcess

class ProvisionError : System.Exception {
  [int] $Code
  ProvisionError([int] $code, [string] $message) : base($message) { $this.Code = $code }
}
function Assert-True([bool] $Condition, [string] $Message) {
  if (-not $Condition) { throw $Message }
}

$file = Join-Path $PSScriptRoot '..\setup\provision.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref] $tokens, [ref] $errors)
Assert-True ($errors.Count -eq 0) (($errors | ForEach-Object Message) -join "`n")
foreach ($name in @('Set-ServiceRecovery', 'Start-SqlService')) {
  $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  Assert-True ($null -ne $definition) "Missing provisioning function $name"
  Invoke-Expression $definition.Extent.Text
}

$script:ServiceName = 'MSSQL$PROJECTMGR'
$script:Port = 14330
$script:Original = 'O:SYG:BAD:P(D;;DC;;;WD)(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCLCSWRPWPDTLOCRRC;;;BA)'
$script:Descriptor = $script:Original
$script:Failure = ''
$script:Writes = 0
function Write-Log([string] $Message) { }
function sc.exe {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)
  $global:LASTEXITCODE = 0
  Assert-True ($Arguments[1] -eq $script:ServiceName) 'A command targeted a different service'
  if ($Arguments[0] -eq $script:Failure) { $global:LASTEXITCODE = 5; return }
  if ($Arguments[0] -eq 'sdshow') { return $script:Descriptor }
  if ($Arguments[0] -eq 'sdset') { $script:Descriptor = $Arguments[2]; $script:Writes++ }
}

Set-ServiceRecovery
$before = New-Object System.Security.AccessControl.RawSecurityDescriptor $script:Original
$after = New-Object System.Security.AccessControl.RawSecurityDescriptor $script:Descriptor
$interactive = @($after.DiscretionaryAcl | Where-Object { $_.SecurityIdentifier.Value -eq 'S-1-5-4' })
Assert-True ($interactive.Count -eq 1) 'Interactive users need one merged service ACE'
Assert-True ($interactive[0].AccessMask -eq 0x14) 'Grant exactly query-status and start, without stop or configure'
Assert-True ($after.Owner.Value -eq $before.Owner.Value) 'Preserve the service owner'
Assert-True ($after.Group.Value -eq $before.Group.Value) 'Preserve the service group'
Assert-True (($after.ControlFlags -band [System.Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -ne 0) 'Preserve DACL protection'
$originalEntries = @($before.DiscretionaryAcl | ForEach-Object { "$($_.AceType):$($_.SecurityIdentifier.Value):$($_.AccessMask)" } | Sort-Object)
$keptEntries = @($after.DiscretionaryAcl | Where-Object { $_.SecurityIdentifier.Value -ne 'S-1-5-4' } | ForEach-Object { "$($_.AceType):$($_.SecurityIdentifier.Value):$($_.AccessMask)" } | Sort-Object)
Assert-True (($originalEntries -join '|') -eq ($keptEntries -join '|')) 'Preserve existing allow and deny entries'
Set-ServiceRecovery
Assert-True ($script:Writes -eq 1) 'Repeated repair must not keep rewriting the service DACL'

foreach ($command in @('failure', 'failureflag', 'sdshow', 'sdset')) {
  $script:Failure = $command; $script:Descriptor = $script:Original
  $caught = $false
  try { Set-ServiceRecovery } catch [ProvisionError] { $caught = $_.Exception.Code -eq 40 }
  Assert-True $caught "A failed $command must be reported as repair failure"
}
$script:Failure = ''

$script:Starts = 0; $script:Resumes = 0; $script:Automatic = 0
$script:Ready = $true
$script:Service = $null
function Get-Service([string] $Name, [string] $ErrorAction) { return $script:Service }
function Set-Service([string] $Name, [string] $StartupType) { $script:Automatic++ }
function Start-Service([string] $Name) { $script:Starts++ }
function Restart-Service([string] $Name, [switch] $Force) { throw 'Connection repair must not restart a running service' }
function Resume-Service([string] $Name) { $script:Resumes++ }
function Test-TcpPort([int] $TimeoutSeconds) { return $script:Ready }
function Use-Service([string] $Status, [string] $StartType = 'Automatic') {
  $script:Service = [PSCustomObject]@{ Status = $Status; StartType = $StartType }
  $script:Service | Add-Member ScriptMethod WaitForStatus { param($status, $timeout) $this.Status = 'Stopped' }
  $script:Service | Add-Member ScriptMethod Refresh { }
}
Use-Service 'StartPending'
Start-SqlService $false
Assert-True ($script:Starts -eq 0) 'Wait for a pending start instead of issuing another start'
Use-Service 'StopPending'
Start-SqlService $false
Assert-True ($script:Starts -eq 1) 'Wait for stop completion before starting'
Use-Service 'Stopped' 'Disabled'
Start-SqlService $false
Assert-True ($script:Automatic -eq 1) 'Repair a disabled service startup type'
Assert-True ($script:Starts -eq 2) 'Start the existing stopped service'
Use-Service 'Paused'
Start-SqlService $false
Assert-True ($script:Resumes -eq 1) 'Resume a paused service during explicit repair'
Use-Service 'Running'
Start-SqlService $false
Assert-True ($script:Starts -eq 2) 'Leave an already running service alone'
$script:Ready = $false
$caught = $false
try { Start-SqlService $false } catch [ProvisionError] { $caught = $_.Exception.Code -eq 40 }
Assert-True $caught 'Do not report repair success before the engine listens'

$branch = $ast.Find({
  param($node)
  $node -is [System.Management.Automation.Language.IfStatementAst] -and
    $node.Clauses[0].Item1.Extent.Text -eq '$ServiceOnly' -and
    $node.Clauses[0].Item2.Extent.Text.Contains('Start-SqlService')
}, $true)
Assert-True ($null -ne $branch) 'Provisioning must have a service-only repair path'
$allowed = @('Get-Service', 'Set-ServiceRecovery', 'Start-SqlService', 'Write-Log')
$commands = $branch.Clauses[0].Item2.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true)
foreach ($command in $commands) {
  Assert-True ($command.GetCommandName() -in $allowed) 'Service-only repair must not change SQL logins, data folders or machine.json'
}
Write-Host 'Windows service recovery checks passed: permissions, idempotence, errors, pending states and service-only isolation.'
