@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
echo ================================================================
echo   Claude Control Room - provided AS-IS, free of charge.
echo   NO warranty of any kind: not for results, accuracy,
echo   compatibility, costs, or any damage. Use at your own risk.
echo   Keep this window open. Close it to stop the dashboard.
echo ================================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (py server.py --open) else (python server.py --open)
pause
