!macro desktopPetFindExactAppProcess _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$target = [IO.Path]::GetFullPath('$INSTDIR\${APP_EXECUTABLE_FILENAME}'); $$matches = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($$_.ExecutablePath), $$target, [StringComparison]::OrdinalIgnoreCase) }); if ($$matches.Count -gt 0) { exit 0 } else { exit 1 } } catch { exit 2 }"`
  Pop ${_RETURN}
!macroend

!macro desktopPetStopExactAppProcess _FORCE _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$target = [IO.Path]::GetFullPath('$INSTDIR\${APP_EXECUTABLE_FILENAME}'); Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($$_.ExecutablePath), $$target, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId ${_FORCE} -ErrorAction Stop }; exit 0 } catch { exit 2 }"`
  Pop ${_RETURN}
!macroend

!macro customCheckAppRunning
  !insertmacro desktopPetFindExactAppProcess $R0
  ${if} $R0 == 0
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
  ${endif}
  Goto desktop_pet_not_running

  desktop_pet_cancel_install:
  Quit

  desktop_pet_not_running:
!macroend
