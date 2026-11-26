"""Saves the scout's final JSON (printed by the agent, which has no Write tool) to scout.json.
Takes the last top-level {...} block in the log that parses as JSON and has a "findings" list; otherwise leaves scout.json alone."""
import json
import sys
from pathlib import Path


def last_report(text):
    best = None
    for start in [i for i, ch in enumerate(text) if ch == "{"]:
        depth, in_str, esc = 0, False, False
        for j in range(start, len(text)):
            ch = text[j]
            if in_str:
                esc = (ch == "\\") and not esc
                if ch == '"' and not esc:
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[start:j + 1])
                        if isinstance(obj, dict) and isinstance(obj.get("findings"), list):
                            best = obj
                    except ValueError:
                        pass
                    break
    return best


def main(log, out):
    rep = last_report(Path(log).read_text(encoding="utf-8", errors="replace"))
    if rep is None:
        print("scout: no report found in", log)
        return 1
    Path(out).write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    print("scout: saved", len(rep["findings"]), "findings to", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
