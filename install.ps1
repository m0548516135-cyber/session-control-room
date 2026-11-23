# Session Control Room - installer / checker (Windows).
# Safe to run more than once. Installs nothing without telling you; it checks
# prerequisites, writes control-room\config.json, adds a desktop shortcut and,
# with -Scout, registers the weekly scout task.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Scout
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ProjectsDir "D:\my-projects"
#
# This file is ASCII on purpose (Windows PowerShell 5.1 misreads UTF-8 without BOM).
param(
  [switch]$Scout,
  [string]$ProjectsDir = "",
  [int]$Port = 8790
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CR   = Join-Path $Root "control-room"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host " Session Control Room is provided AS-IS, free of charge." -ForegroundColor Yellow
Write-Host " NO warranty of any kind: not for results, accuracy, compatibility," -ForegroundColor Yellow
Write-Host " costs, or any damage. You install and use it at your own risk." -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""

$missing = @()
function Test-Cmd($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Report($ok, $label, $hint) {
  if ($ok) { Write-Host ("  [OK]   " + $label) -ForegroundColor Green }
  else     { Write-Host ("  [--]   " + $label + "   ->  " + $hint) -ForegroundColor DarkYellow }
}

Write-Host "Required:"
$py = $null
if (Test-Cmd "py") { $py = "py" } elseif (Test-Cmd "python") { $py = "python" }
$pyOk = $false
if ($py) {
  try { & $py -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"; $pyOk = ($LASTEXITCODE -eq 0) } catch { $pyOk = $false }
}
Report $pyOk "Python 3.10+" "install from https://www.python.org/downloads/ and tick 'Add python.exe to PATH'"
if (-not $pyOk) { $missing += "Python" }

$gitOk = Test-Cmd "git"
Report $gitOk "Git for Windows" "install from https://git-scm.com/download/win"
if (-not $gitOk) { $missing += "Git" }

$claudeOk = Test-Cmd "claude"
Report $claudeOk "Claude Code" "run:  irm https://claude.ai/install.ps1 | iex   then run 'claude' once to sign in"
if (-not $claudeOk) { $missing += "Claude Code" }

Write-Host ""
Write-Host "Optional (self-improvement pipeline):"
Report (Test-Cmd "ffmpeg") "ffmpeg (video -> audio)" "winget install Gyan.FFmpeg"
$fw = $false
if ($pyOk) { try { & $py -c "import faster_whisper" 2>$null; $fw = ($LASTEXITCODE -eq 0) } catch { $fw = $false } }
Report $fw "faster-whisper (local transcription)" "$py -m pip install faster-whisper"

Write-Host ""
Write-Host "Optional (weekly scout):"
Report (Test-Cmd "uv") "uv (Python tool manager)" "powershell -ExecutionPolicy ByPass -c ""irm https://astral.sh/uv/install.ps1 | iex"""
$ss = Test-Path (Join-Path $env:APPDATA "uv\tools\skillspector\Scripts\python.exe")
Report $ss "SkillSpector (security scanner)" "uv tool install skillspector"

# ---- config.json (machine-specific, git-ignored; read by server.py) ----
if (-not $ProjectsDir) { $ProjectsDir = Split-Path -Parent $Root }
$cfg = [ordered]@{ port = $Port; projects_dir = $ProjectsDir; improve_dir = (Join-Path $Root "self-improvement") } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $CR "config.json"), $cfg, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Wrote control-room\config.json  (port $Port)"

# ---- desktop shortcut ----
$startCmd = Join-Path $CR "start.cmd"
if ($startCmd -match '[^\x00-\x7F]') {
  # Windows shortcuts and .cmd files are unreliable with non-English folder names.
  Write-Host "No desktop shortcut: the folder path has non-English characters." -ForegroundColor DarkYellow
  Write-Host "Start with control-room\start.cmd, or move the folder to a path like C:\tools\session-control-room and run this again." -ForegroundColor DarkYellow
} else {
  try {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Session Control Room.lnk"))
    $lnk.TargetPath = $startCmd
    $lnk.WorkingDirectory = $CR
    $lnk.Save()
    Write-Host "Added desktop shortcut: Session Control Room"
  } catch { Write-Host "Could not create a desktop shortcut (not critical). Use control-room\start.cmd." -ForegroundColor DarkYellow }
}

# ---- weekly scout task ----
if ($Scout) {
  if (-not $claudeOk) {
    Write-Host "Skipping the scout task: Claude Code is not installed yet." -ForegroundColor DarkYellow
  } else {
    $a = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ('/c "' + (Join-Path $CR "scout\run_scout.cmd") + '"')
    $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 9am
    Register-ScheduledTask -TaskName "Claude Skill Scout" -Action $a -Trigger $t -Force | Out-Null
    Write-Host "Registered weekly task 'Claude Skill Scout' (Sundays 09:00). Edit control-room\scout\needs.md first!"
  }
}

Write-Host ""
if ($missing.Count -gt 0) {
  Write-Host ("Install the missing required items first: " + ($missing -join ", ")) -ForegroundColor Red
  Write-Host "Then run this script again."
} else {
  Write-Host "Ready. Start the dashboard with control-room\start.cmd" -ForegroundColor Green
  Write-Host "(or the 'Session Control Room' desktop shortcut, if one was added). It opens http://localhost:$Port"
}
Write-Host ""
