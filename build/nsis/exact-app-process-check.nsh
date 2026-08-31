; 0.1.5 卸载器 CRC 修复：在 macOS(Catalina+) 上构建时，electron-builder 走 UninstallerReader
; 直接拼接 exehead 与内嵌卸载数据块（不执行 WriteUninstaller 运行时的 unicon 补丁，也不重算
; CRC），产出的卸载器自检必失败（NSIS Error: Installer integrity check has failed，
; 上游 electron-userland/electron-builder#4875，26.15.3 仍存在）。仅对卸载器编译
; （BUILD_UNINSTALLER pass）关闭 CRC 自检；安装器自身 CRC 保持开启不受影响。
!ifdef BUILD_UNINSTALLER
  CRCCheck off
!endif

!macro desktopPetFindExactAppProcess _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$target = [IO.Path]::GetFullPath('$INSTDIR\${APP_EXECUTABLE_FILENAME}'); $$matches = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($$_.ExecutablePath), $$target, [StringComparison]::OrdinalIgnoreCase) }); if ($$matches.Count -gt 0) { exit 0 } else { exit 1 } } catch { exit 2 }"`
  Pop ${_RETURN}
!macroend

!macro desktopPetStopExactAppProcess _FORCE _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$target = [IO.Path]::GetFullPath('$INSTDIR\${APP_EXECUTABLE_FILENAME}'); Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($$_.ExecutablePath), $$target, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId ${_FORCE} -ErrorAction Stop }; exit 0 } catch { exit 2 }"`
  Pop ${_RETURN}
!macroend

!macro desktopPetPreUninstallOldVersion
!ifndef BUILD_UNINSTALLER
  !insertmacro readReg $R6 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R6 == ""
    DetailPrint "desktop-pet: no previous uninstall entry; skip pre-uninstall probe."
  ${else}
    DetailPrint "desktop-pet: previous uninstall entry found."
    !insertmacro GetInQuotes $R7 "$R6"
    !insertmacro readReg $R8 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R8 == ""
    ${andIf} $R7 != ""
      Push $R7
      Call GetFileParent
      Pop $R8
    ${endif}
    DetailPrint "desktop-pet: old uninstaller probe target=$R7 dir=$R8"
    ${if} $R7 != ""
    ${andIf} $R8 != ""
    ${andIf} ${FileExists} "$R7"
      ClearErrors
      CopyFiles /SILENT "$R7" "$PLUGINSDIR\desktop-pet-old-uninstaller.exe"
      ${if} ${FileExists} "$PLUGINSDIR\desktop-pet-old-uninstaller.exe"
        ${if} $installMode == "CurrentUser"
          StrCpy $R9 "/currentuser"
        ${else}
          StrCpy $R9 "/allusers"
        ${endif}
        ExecWait '"$PLUGINSDIR\desktop-pet-old-uninstaller.exe" /S /KEEP_APP_DATA $R9 --updated _?=$R8' $R5
        DetailPrint "desktop-pet: old uninstaller probe exit=$R5"
        !insertmacro readReg $R6 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
        ${if} $R6 == ""
          DetailPrint "desktop-pet: old version removed by probe; default uninstallOldVersion will no-op."
        ${else}
          DetailPrint "desktop-pet: old uninstall entry still present after probe; default flow continues."
        ${endif}
      ${else}
        DetailPrint "desktop-pet: copy of old uninstaller failed; default flow continues."
      ${endif}
    ${else}
      DetailPrint "desktop-pet: old uninstaller path unresolved; default flow continues."
    ${endif}
  ${endif}
!endif
!macroend

!macro customUnInstallCheck
  IfErrors 0 desktop_pet_uninstall_result_code
  DetailPrint "desktop-pet: old uninstaller could not be launched."
  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  Return
  desktop_pet_uninstall_result_code:
  DetailPrint "desktop-pet: old uninstaller exit code=$R0"
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customCheckAppRunning
  DetailPrint "desktop-pet: customCheckAppRunning enter; INSTDIR=$INSTDIR action=query-exact-process"
  !insertmacro desktopPetFindExactAppProcess $R0
  ${if} $R0 == 0
    DetailPrint "desktop-pet: exact app process found; INSTDIR=$INSTDIR exit=$R0 action=close-app"
    ${ifNot} ${isUpdated}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK desktop_pet_close_app IDCANCEL desktop_pet_cancel_install
    ${endif}

    desktop_pet_close_app:
    DetailPrint "Closing the exact installed application executable."
    !insertmacro desktopPetStopExactAppProcess "" $R0
    Sleep 500
    StrCpy $R1 0

    desktop_pet_check_again:
    !insertmacro desktopPetFindExactAppProcess $R0
    ${if} $R0 == 1
      Goto desktop_pet_not_running
    ${elseIf} $R0 != 0
      DetailPrint "Process query failed; continuing without a false running-app block."
      DetailPrint "desktop-pet: process query failed in retry loop; INSTDIR=$INSTDIR exit=$R0 action=continue-install"
      Goto desktop_pet_not_running
    ${endif}

    IntOp $R1 $R1 + 1
    !insertmacro desktopPetStopExactAppProcess "-Force" $R0
    Sleep 1000
    ${if} $R1 > 1
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY desktop_pet_check_again IDCANCEL desktop_pet_cancel_install
    ${else}
      Goto desktop_pet_check_again
    ${endif}
  ${elseIf} $R0 != 1
    DetailPrint "Process query failed; continuing without a false running-app block."
    DetailPrint "desktop-pet: process query failed; INSTDIR=$INSTDIR exit=$R0 action=continue-install"
  ${endif}
  Goto desktop_pet_not_running

  desktop_pet_cancel_install:
  Quit

  desktop_pet_not_running:
  !insertmacro desktopPetPreUninstallOldVersion
!macroend
