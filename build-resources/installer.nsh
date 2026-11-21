; Modulus - NSIS hooks (included via electron-builder.config.cjs: nsis.include).
;
; The app is installed per user (%LOCALAPPDATA%\Programs\Modulus), so
; installing it and every later update need no administrator rights. Only the
; database engine (a machine-wide SQL Server service) needs them, once per PC:
; provision.ps1 asks Windows for administrator approval itself, and is skipped
; when the engine is already set up (machine.json exists), so updates never ask.
;
; NOTE: the electron-builder NSIS stub is 32-bit. A 32-bit PowerShell would
; write SQL Server's registry settings into WOW6432Node where the 64-bit engine
; never reads them, so we launch the 64-bit PowerShell through Sysnative.

; The wizard names the product once, in its title bar ("Modulus Setup"), so its
; pages and footer do not repeat it. This file is read before the pages are declared: the
; finish page takes these defines, customPageAfterChangeDir runs just before the Installing
; page, and customHeader runs after electron-builder sets its "<name> <version>" footer.
!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "Installation complete"
  !define MUI_FINISHPAGE_TEXT "Click Finish to close Setup."
!endif

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_SUBTEXT "This can take a few minutes."
!macroend

!macro customHeader
  BrandingText "Version ${VERSION}"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; An update keeps the old version whole in "<install dir>.previous" until the new files are in,
; so a power cut or a killed installer between the two steps loses nothing. The uninstaller run
; by an update is the one shipped with the OLD version, so this protects updates from the
; release after the one that first ships it. A busy folder falls back to the default file-by-file
; move, so an update never fails where it worked before.
!macro customRemoveFiles
  SetOutPath $TEMP
  RMDir /r "$INSTDIR.previous"
  ${if} ${isUpdated}
    ClearErrors
    Rename "$INSTDIR" "$INSTDIR.previous"
    ${if} ${Errors}
      CreateDirectory "$PLUGINSDIR\old-install"
      Push ""
      Call un.atomicRMDir
      Pop $R0
      ${if} $R0 != 0
        DetailPrint "File is busy, aborting: $R0"
        Push ""
        Call un.restoreFiles
        Pop $R0
        Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
      ${endif}
    ${endif}
  ${endif}
  RMDir /r $INSTDIR
!macroend

; A "<install dir>.previous" left behind means the last update stopped before its files were in:
; put the old version back first, then this run updates it as usual.
!macro customInit
  IfFileExists "$INSTDIR.previous\${APP_EXECUTABLE_FILENAME}" 0 pm_restore_done
    SetOutPath $TEMP
    RMDir /r "$INSTDIR.partial"
    ClearErrors
    IfFileExists "$INSTDIR\*.*" 0 pm_restore_move
      Rename "$INSTDIR" "$INSTDIR.partial"
      IfErrors pm_restore_done
    pm_restore_move:
    Rename "$INSTDIR.previous" "$INSTDIR"
    RMDir /r "$INSTDIR.partial"
  pm_restore_done:
!macroend

!macro customInstall
  RMDir /r "$INSTDIR.previous"
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

  ; 2. Versions before the rename were installed under the old name. Remove that copy so this
  ;    one is the only one. Its settings and data are kept.
  StrCpy $R3 "$LOCALAPPDATA\Programs\Project Manager"
  IfFileExists "$R3\Uninstall Project Manager.exe" 0 pm_legacy_done
    DetailPrint "Removing the previous version..."
    ExecWait '"$R3\Uninstall Project Manager.exe" /S /KEEP_APP_DATA _?=$R3' $R0
    StrCmp $R0 "0" 0 pm_legacy_done
      Delete "$R3\Uninstall Project Manager.exe"
      RMDir "$R3"
      Delete "$SMPROGRAMS\Project Manager.lnk"
      Delete "$DESKTOP\Project Manager.lnk"
  pm_legacy_done:

  ; 3. Database engine: once per PC. A PC set up before the rename keeps its old folder.
  IfFileExists "$R2\Modulus\machine.json" pm_db_ready 0
  IfFileExists "$R2\Project Manager\machine.json" 0 pm_provision
  pm_db_ready:
    DetailPrint "The database engine is already set up on this PC."
    Goto pm_db_ok
  pm_provision:
  DetailPrint "Setting up the Modulus database engine..."
  DetailPrint "Windows asks for administrator approval. A first-time setup takes 5-15 minutes."
  StrCpy $R3 ""
  IfFileExists "$INSTDIR\resources\sql-express\SQLEXPR_x64_ENU.exe" 0 +2
    StrCpy $R3 ' -SqlInstaller "$INSTDIR\resources\sql-express\SQLEXPR_x64_ENU.exe"'
  nsExec::ExecToLog '"$R1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\provision.ps1"$R3'
  Pop $R0
  StrCmp $R0 "0" pm_db_ok
  StrCmp $R0 "11" 0 pm_db_failed
    MessageBox MB_OK|MB_ICONEXCLAMATION "The database engine was not set up because administrator approval was not given.$\r$\n$\r$\nOpen Modulus and choose Repair, then approve the Windows prompt." /SD IDOK
    Goto pm_db_ok
  pm_db_failed:
    MessageBox MB_OK|MB_ICONEXCLAMATION "The database engine could not be set up (code $R0).$\r$\n$\r$\nModulus will offer to repair it when you open it.$\r$\nDetails: $R2\Modulus\logs\provision.log" /SD IDOK
  pm_db_ok:
!macroend

; Uninstall keeps the database and its backups on purpose (client data).
; To remove them completely: uninstall "Microsoft SQL Server 2022" from
; Apps & features and delete %ProgramData%\Modulus.
