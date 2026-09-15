@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start.ps1"
set "PET_ACCEPTANCE_EXIT=%ERRORLEVEL%"
echo.
echo Finished. Reports: tools\results-*
pause
exit /b %PET_ACCEPTANCE_EXIT%
