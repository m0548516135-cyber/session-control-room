"""Runs at every start: is there a newer version on GitHub? Tells you, and updates only if you say yes.

Never updates by itself (anyone who can push to the repo could otherwise run code on your machine).
Silent when there is no internet, no git, or the folder is not a git clone. Never blocks the start for long.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def git(*args, timeout=10):
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=timeout)


def main():
    if not (REPO / ".git").exists():
        return
    try:
        if git("fetch", "--quiet", timeout=12).returncode != 0:
            return
        behind = git("rev-list", "--count", "HEAD..@{u}").stdout.strip()
        if not behind.isdigit() or int(behind) == 0:
            return
        log = git("log", "--format=  - %s", "HEAD..@{u}", "-n", "8").stdout.rstrip()
    except (OSError, subprocess.TimeoutExpired):
        return
    print("================================================================")
    print(f"  A new version of the Control Room is available ({behind} update(s)):")
    print(log)
    print("================================================================")
    try:
        ans = input("  Update now? [y/N] ").strip().lower()
    except EOFError:
        return
    if ans not in ("y", "yes", "כ", "כן"):
        print("  Skipped. You can update later with:  git pull   (in the install folder)")
        return
    r = git("pull", "--ff-only", timeout=60)
    if r.returncode == 0:
        print("  Updated. Starting the new version...")
        # cached parse results may come from the old version; the server rebuilds them when the cache version changes
    else:
        print("  Could not update automatically (local changes?). Run  git pull  yourself. Starting the current version.")
        print(r.stderr.strip()[:400])


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
