---
name: control-room
description: Install, start, check or explain the Session Control Room, a local zero-token dashboard (http://localhost:8790) that shows what every Claude Code session is doing, with a weekly skill scout and a video-to-proposals self-improvement pipeline. Use when the user says "control room", "חדר בקרה", "open/start the dashboard", "install the control room", "set up the scout", "what is Claude doing right now", or asks to see their sessions, token use or skills visually.
---

# Session Control Room

A local dashboard over Claude Code's own files. It makes **no model calls and costs no tokens**: a Python
standard-library server reads `~/.claude/projects/**/*.jsonl`, the installed skills/agents/MCP servers, and
serves a page at `http://localhost:8790`. Windows 11 is the tested platform.

Source and full guide (Hebrew): https://github.com/m0548516135-cyber/session-control-room

Reply to the user in their language. Keep it short and concrete.

## 0. Disclaimer first

Before installing, tell the user plainly: the software is provided **AS-IS, free, with no warranty or
commitment of any kind from its creator** (results, accuracy, compatibility, costs, damage). Installing and
using it is at their own risk. Continue only if they agree. The dashboard shows the same notice on first open.

## 1. Is it already installed?

Look for `server.py` in, in this order:
1. the folder the user names;
2. `%USERPROFILE%\session-control-room\control-room\`;
3. `C:\tools\session-control-room\control-room\`.

If found, skip to step 3. If `http://localhost:8790` (or the port in `control-room\config.json`) already
answers, it is already running: just open it.

## 2. Install

1. Pick the target folder. Prefer a path with **English characters only** (Windows shortcuts and `.cmd`
   files break on other scripts): `%USERPROFILE%\session-control-room` if the user name is plain English,
   otherwise `C:\tools\session-control-room`. Confirm the folder with the user.
2. Clone: `git clone https://github.com/m0548516135-cyber/session-control-room.git "<target>"`
   (if git is missing, tell the user to install Git for Windows from https://git-scm.com/download/win).
3. Run the checker/installer and show the user its output:
   `powershell -NoProfile -ExecutionPolicy Bypass -File "<target>\install.ps1"`
   - It checks Python 3.10+, Git, Claude Code (required) and ffmpeg, faster-whisper, uv, SkillSpector
     (optional). It installs no software by itself; it prints the exact command for anything missing.
   - For anything missing, offer to run the printed command, and run it only after the user agrees.
   - It writes `control-room\config.json` and, for English-only paths, a desktop shortcut.
   - Options: `-Port 8791` for another port, `-ProjectsDir "<folder>"` for where the user's projects live.
4. Do not commit or share `control-room\.cache.json`, `config.json`, `scout.json`: they are private.

## 3. Start and verify

- Start it so it keeps running after this session: `start "" "<target>\control-room\start.cmd"` from cmd,
  or tell the user to double-click `start.cmd`. It opens the browser by itself. The black window is the
  server: closing it stops the dashboard.
- Verify before saying it works: request `http://localhost:<port>/api/state` and check for HTTP 200 and a
  `"sessions"` list. If the port is busy, the server prints that clearly; another copy may already be running.
- The 3D "World" tab loads Three.js from cdn.jsdelivr.net; without internet, the "Stations" tab still works.

## 4. Optional parts (only if the user wants them)

**Weekly scout** (finds skills only for needs the user lists; never installs anything; one Sonnet run a week):
1. Optional tools: `uv` and `uv tool install skillspector`.
2. Help the user write their real needs into `<target>\control-room\scout\needs.md`
   (`## Project` headings, `- need` lines). With no needs, the scout searches nothing.
3. Register the task: `install.ps1 -Scout` (Sundays 09:00). Manual test run: `control-room\scout\run_scout.cmd`,
   then read `scout\last_run.log` and check that `scout.json` was written.

**Self-improvement** (videos → transcripts → insights → proposals → user approval → execution):
1. Needs ffmpeg and `py -m pip install faster-whisper`.
2. The user drops videos into `<target>\self-improvement\videos\`, opens Claude in `<target>\self-improvement`,
   and runs `/improve`. Approve proposals with `[x]` in `PROPOSALS.md` (or the dashboard's approve button),
   then `/apply`. Only `AUTO` items are executed; `MANUAL` items get instructions.

## 5. Explaining the dashboard

Tabs: **World** (3D island: a figure per live session, hat = model, a building per information source;
click a building to see the real recent actions animated), **Self-improvement**, **Stations** (per-session
detail), **Skills** (archive/restore skills), **Scout & proposals** (approve proposals), **Infrastructure**
(agents, MCP servers, plugins, graphify graphs).

Honest limits to mention when relevant: it sees what Claude *asked* to do (tool inputs), not always the
results; closed sessions are hidden; only the last 30 days are scanned.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Browser cannot connect | Server not running: run `start.cmd`, wait 3 seconds, refresh. Read the black window's message. |
| "Port … is busy" | Already running (just open the URL) or use `install.ps1 -Port 8791`. |
| "An Application Control policy has blocked this file" | Windows Smart App Control blocks some pip `.exe` launchers and DLLs. SkillSpector is already run through Python (`scout\scan.py`). If faster-whisper itself is blocked, transcription must run in WSL. |
| Odd numbers after updating the code | Delete `control-room\.cache.json` and restart. |
| A proposal is not shown | The line in `PROPOSALS.md` does not match the required format (see the README). |

Update to the latest version: `git -C "<target>" pull`, then restart `start.cmd`.
