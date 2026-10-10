; Project Manager - NSIS hooks (included via electron-builder.config.cjs: nsis.include).
;
; The app is installed per user (%LOCALAPPDATA%\Programs\Project Manager), so
; installing it and every later update need no administrator rights. Only the
; database engine (a machine-wide SQL Server service) needs them, once per PC:
; provision.ps1 asks Windows for administrator approval itself, and is skipped
; when the engine is already set up (machine.json exists), so updates never ask.
;
; NOTE: the electron-builder NSIS stub is 32-bit. A 32-bit PowerShell would
; write SQL Server's registry settings into WOW6432Node where the 64-bit engine
; never reads them, so we launch the 64-bit PowerShell through Sysnative.

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  StrCpy $R1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$R1" pm_ps_found 0
    StrCpy $R1 "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  pm_ps_found:
  ReadEnvStr $R2 PROGRAMDATA

  ; 1. Versions before 1.0.0 were installed for all users (C:\Program Files).
  ;    Remove that copy so this one is the only one. Data is kept.
  ReadRegStr $R3 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $R3 "" pm_old_done
  IfFileExists "$R3\Uninstall Project Manager.exe" 0 pm_old_done
    DetailPrint "Removing the previous version (installed for all users)..."
    DetailPrint "Windows asks for administrator approval."
    nsExec::ExecToLog '"$R1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\remove-all-users-install.ps1" -InstallDir "$R3"'
    Pop $R0
    StrCmp $R0 "0" pm_old_done
      MessageBox MB_OK|MB_ICONEXCLAMATION "The previous version of Project Manager could not be removed (code $R0).$\r$\n$\r$\nPlease uninstall the older 'Project Manager' in Settings > Apps.$\r$\nYour data is kept." /SD IDOK
  pm_old_done:

  ; 2. Database engine: once per PC.
  IfFileExists "$R2\Project Manager\machine.json" 0 pm_provision
    DetailPrint "The database engine is already set up on this PC."
    Goto pm_db_ok
  pm_provision:
  DetailPrint "Setting up the Project Manager database engine..."
  DetailPrint "Windows asks for administrator approval. A first-time setup takes 5-15 minutes."
  nsExec::ExecToLog '"$R1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\provision.ps1" -SqlInstaller "$INSTDIR\resources\sql-express\SQLEXPR_x64_ENU.exe"'
  Pop $R0
  StrCmp $R0 "0" pm_db_ok
  StrCmp $R0 "11" 0 pm_db_failed
    MessageBox MB_OK|MB_ICONEXCLAMATION "The database engine was not set up because administrator approval was not given.$\r$\n$\r$\nOpen Project Manager and choose Repair, then approve the Windows prompt." /SD IDOK
    Goto pm_db_ok
  pm_db_failed:
    MessageBox MB_OK|MB_ICONEXCLAMATION "The database engine could not be set up (code $R0).$\r$\n$\r$\nProject Manager will offer to repair it when you open it.$\r$\nDetails: $R2\Project Manager\logs\provision.log" /SD IDOK
  pm_db_ok:
!macroend

; Uninstall keeps the database and its backups on purpose (client data).
; To remove them completely: uninstall "Microsoft SQL Server 2022" from
; Apps & features and delete %ProgramData%\Project Manager.
