@echo off
setlocal
cd /d "%~dp0"
echo Starting Pet Studio Stage 1 acceptance at 100%% display scale...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-acceptance.ps1" -ExpectedDpiPercent 100 -ManualProfile core
set "stage_exit=%ERRORLEVEL%"
echo.
if "%stage_exit%"=="0" (
  echo Stage 1 completed. Keep the acceptance-evidence folder.
) else (
  echo Stage 1 stopped or failed. Keep the acceptance-evidence folder for diagnosis.
)
pause
exit /b %stage_exit%
