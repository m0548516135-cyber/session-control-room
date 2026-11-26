@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
echo ================================================================
echo   Session Control Room - provided AS-IS, free of charge.
echo   NO warranty of any kind: not for results, accuracy,
echo   compatibility, costs, or any damage. Use at your own risk.
echo   Keep this window open. Close it to stop the dashboard.
echo ================================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (set PY=py) else (set PY=python)
rem Checks GitHub for a newer version and asks before updating (never updates by itself).
%PY% update_check.py
%PY% server.py --open
pause
