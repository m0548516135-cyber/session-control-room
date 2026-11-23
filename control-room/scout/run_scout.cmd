@echo off
rem Weekly skill scout: headless Claude run, writes ..\scout.json for the control room. Installs nothing.
cd /d "%~dp0"
set PYTHONUTF8=1
claude -p "Follow the instructions in prompt.md in the current folder exactly." ^
  --model sonnet --max-turns 60 ^
  --allowedTools "Read" "Write" "Glob" "Grep" "WebSearch" "WebFetch" "mcp__firecrawl__firecrawl_search" "mcp__firecrawl__firecrawl_scrape" "Bash(git clone:*)" "Bash(py scan.py:*)" "Bash(python scan.py:*)" "Bash(mkdir:*)" "Bash(ls:*)" ^
  > last_run.log 2>&1
