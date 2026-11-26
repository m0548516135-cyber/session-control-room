@echo off
rem Weekly skill scout: headless Claude run, writes ..\scout.json for the control room. Installs nothing.
cd /d "%~dp0"
set PYTHONUTF8=1
claude -p "Follow the instructions in prompt.md in the current folder exactly." ^
  --model sonnet --max-turns 60 ^
  --allowedTools "Read" "Glob" "Grep" "WebSearch" "WebFetch" "mcp__firecrawl__firecrawl_search" "mcp__firecrawl__firecrawl_scrape" "Bash(git clone:*)" "Bash(py -I scan.py:*)" "Bash(python -I scan.py:*)" "Bash(mkdir:*)" "Bash(ls:*)" ^
  > last_run.log 2>&1
rem The agent has no Write tool (it reads untrusted repos/pages): it prints the JSON, and this runner saves it.
where py >nul 2>nul
if %errorlevel%==0 (py -I save_report.py last_run.log ..\scout.json) else (python -I save_report.py last_run.log ..\scout.json)
