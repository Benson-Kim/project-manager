; Project Manager - NSIS hooks (included via electron-builder.config.cjs: nsis.include).
;
; The installer runs elevated (perMachine), so this is the one place that can
; install the SQL Server Express service. provision.ps1 is idempotent: on an
; upgrade it only verifies the engine, logins and machine.json.
;
; NOTE: the electron-builder NSIS stub is 32-bit. A 32-bit PowerShell would
; write SQL Server's registry settings into WOW6432Node where the 64-bit engine
; never reads them, so we launch the 64-bit PowerShell through Sysnative.

!macro customInstall
  DetailPrint "Setting up the Project Manager database engine..."
  DetailPrint "A first-time install takes 5-15 minutes. Please keep this window open."

  StrCpy $R1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$R1" pm_ps_found 0
    StrCpy $R1 "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  pm_ps_found:

  nsExec::ExecToLog '"$R1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\provision.ps1" -SqlInstaller "$INSTDIR\resources\sql-express\SQLEXPR_x64_ENU.exe"'
  Pop $R0

  StrCmp $R0 "0" pm_db_ok
    ReadEnvStr $R2 PROGRAMDATA
    MessageBox MB_OK|MB_ICONEXCLAMATION "The database engine could not be set up (code $R0).$\r$\n$\r$\nProject Manager will offer to repair it when you open it.$\r$\nDetails: $R2\Project Manager\logs\provision.log" /SD IDOK
  pm_db_ok:
!macroend

; Uninstall keeps the database and its backups on purpose (client data).
; To remove them completely: uninstall "Microsoft SQL Server 2022" from
; Apps & features and delete %ProgramData%\Project Manager.
