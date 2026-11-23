"""Run SkillSpector on one folder, without its .exe launcher.

Windows Smart App Control often blocks pip/uv-installed .exe launchers, so this
calls SkillSpector through the Python interpreter of its uv tool environment.
Usage:  py scan.py <folder>
"""
import os
import subprocess
import sys
from pathlib import Path

CODE = ("import sys; sys.argv=['skillspector','scan',sys.argv[1],'--no-llm']; "
        "from skillspector.cli_entry import app; app()")


def candidates():
    appdata = os.environ.get("APPDATA")
    if appdata:
        yield Path(appdata) / "uv" / "tools" / "skillspector" / "Scripts" / "python.exe"
    yield Path.home() / ".local" / "share" / "uv" / "tools" / "skillspector" / "bin" / "python"


def main():
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_dir():
        print("usage: scan.py <existing folder>", file=sys.stderr)
        return 2
    for py in candidates():
        if py.exists():
            env = dict(os.environ, PYTHONIOENCODING="utf-8")
            return subprocess.call([str(py), "-c", CODE, sys.argv[1]], env=env)
    print("SkillSpector not found. Install it with:  uv tool install skillspector", file=sys.stderr)
    return 3


if __name__ == "__main__":
    sys.exit(main())
