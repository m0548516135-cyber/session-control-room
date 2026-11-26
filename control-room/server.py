"""Control Room — local dashboard over Claude Code's own files. Zero LLM calls, zero tokens.

Reads: ~/.claude/skills, ~/.claude/agents, ~/.claude.json (MCP), plugins, session transcripts
(~/.claude/projects/**/*.jsonl, parsed incrementally and cached), and PROPOSALS.md.
Run:  py server.py   ->  http://localhost:8790
"""
import json, os, re, threading, time, urllib.parse
from collections import Counter, defaultdict
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path, PureWindowsPath

HOME = Path.home()
CLAUDE = HOME / ".claude"
HERE = Path(__file__).resolve().parent
# Optional settings in config.json next to this file (written by install.ps1), or env vars:
#   port / CR_PORT                 dashboard port (default 8790)
#   projects_dir / CR_PROJECTS_DIR folder that holds your project folders (graphify graphs, browser screenshots)
#   improve_dir / CR_IMPROVE_DIR   the self-improvement folder (default: ../self-improvement)
try:
    _CFG = json.loads((HERE / "config.json").read_text(encoding="utf-8-sig"))
except Exception:
    _CFG = {}


def _setting(key, env, default):
    return os.environ.get(env) or _CFG.get(key) or default


PROJECTS_ROOT = Path(_setting("projects_dir", "CR_PROJECTS_DIR", HERE.parent)).expanduser()
IMPROVE = Path(_setting("improve_dir", "CR_IMPROVE_DIR", HERE.parent / "self-improvement")).expanduser()
PROPOSALS = IMPROVE / "PROPOSALS.md"
CACHE = HERE / ".cache.json"
PORT = int(_setting("port", "CR_PORT", 8790))
WINDOW_DAYS = 30

# ---------- tool classification: where did the information come from ----------
def source_of(tool: str) -> str:
    t = tool.lower()
    if tool in ("Read", "Grep", "Glob", "LS", "NotebookRead"):
        return "files"
    if tool in ("Edit", "Write", "NotebookEdit", "MultiEdit"):
        return "write"
    if tool in ("WebSearch", "WebFetch") or "firecrawl" in t or "alexandria" in t:
        return "web"
    if "playwright" in t or "chrome" in t or "browser" in t:
        return "browser"
    if tool in ("Bash", "PowerShell"):
        return "shell"
    if tool in ("Agent", "Task"):
        return "agents"
    if tool == "Skill":
        return "skills"
    if tool.startswith("mcp__"):
        # creative/media connectors get their own studio; everything else (mail, drive, db, deploy...) = service gates
        if any(k in t for k in ("vidiq", "higgsfield", "elevenlabs", "canva", "descript", "gamma", "generate_image", "generate_video")):
            return "media"
        return "mcp"
    return "other"


def _dom(u: str) -> str:
    m = re.match(r"https?://([^/]+)", u or "")
    return (m.group(1) if m else (u or ""))[:40]


def describe(tool: str, inp) -> str:
    """One Hebrew sentence saying what this tool call actually did."""
    i = inp if isinstance(inp, dict) else {}
    g = lambda k: (i.get(k) or "") if isinstance(i.get(k), str) else ""
    fn = lambda k: "/".join(g(k).replace("\\", "/").split("/")[-2:])
    t = tool
    if t == "Read": return f"קורא {fn('file_path')}"
    if t in ("Edit", "MultiEdit"): return f"עורך {fn('file_path')}"
    if t == "Write": return f"כותב {fn('file_path')}"
    if t == "Grep": return f"מחפש \"{g('pattern')[:40]}\" בקבצים"
    if t == "Glob": return f"מחפש קבצים: {g('pattern')[:40]}"
    if t in ("Bash", "PowerShell"): return (g("description") or g("command"))[:80] or "מריץ פקודה"
    if t == "WebSearch": return f"מחפש בגוגל: {g('query')[:60]}"
    if t == "WebFetch": return f"קורא אתר {_dom(g('url'))}"
    if t == "Skill": return f"מפעיל סקיל {g('skill')}"
    if t in ("Agent", "Task"): return f"שולח סוכן: {(g('description') or g('subagent_type'))[:50]}"
    if t == "AskUserQuestion": return "שואל אותך שאלה"
    if t == "ToolSearch": return "טוען כלי"
    if t.startswith("mcp__"):
        parts = t.split("__"); server = parts[1] if len(parts) > 1 else ""; act = parts[-1]
        low = (server + act).lower()
        if "playwright" in low or "chrome" in low:
            if "navigate" in act: return f"נכנס ל-{_dom(g('url'))}"
            if "click" in act: return f"לוחץ על {(g('element') or g('target') or g('uid'))[:40]}"
            if "snapshot" in act: return "קורא את מבנה הדף"
            if "screenshot" in act: return "מצלם את המסך"
            if "type" in act or "fill" in act: return f"מקליד בדף: {(g('text') or g('value'))[:30]}"
            if "evaluate" in act or "run_code" in act: return "מריץ סקריפט בתוך הדף"
            if "console" in act: return "בודק הודעות שגיאה בדף"
            if "network" in act: return "בודק בקשות רשת של הדף"
            if "wait" in act: return "ממתין שהדף יטען"
            if "tabs" in act or "page" in act: return "מנהל לשוניות"
            if "resize" in act: return "משנה גודל חלון"
            return "כרום: " + act.replace("browser_", "").replace("_", " ")
        if "firecrawl" in low or "alexandria" in low:
            if "search" in act: return f"מחפש ברשת: {(g('query') or g('command'))[:55]}"
            if "scrape" in act: return f"קורא אתר {_dom(g('url'))}"
            if "map" in act or "crawl" in act: return f"סורק אתר {_dom(g('url'))}"
            return "firecrawl: " + act.replace("_", " ")
        if "vidiq" in low:
            q = g("query") or g("username") or g("url")
            names = {"outlier_search": "חיפוש רילסים חריגים באינסטגרם/טיקטוק", "ig_profile_reels": "קורא רילסים של פרופיל",
                     "ig_profile": "בודק פרופיל אינסטגרם", "balance": "בודק יתרת קרדיטים", "watch_shortform": "צופה ברילס",
                     "keyword_research": "מחקר מילות מפתח", "account_discovery": "מחפש חשבונות"}
            for k, v in names.items():
                if k in act: return f"vidIQ: {v}" + (f" · {q[:40]}" if q else "")
            return "vidIQ: " + act.replace("vidiq_", "").replace("_", " ")
        if re.fullmatch(r"[0-9a-f\-]{16,}", server):
            return "כלי חיצוני: " + act.replace("_", " ")
        return f"{server}: " + act.replace("_", " ")
    return t


def detail(tool: str, inp) -> dict:
    """Small structured facts about an action, used by the building interiors (kept tiny on purpose)."""
    i = inp if isinstance(inp, dict) else {}
    s = lambda k, n=100: (i.get(k) if isinstance(i.get(k), str) else "")[:n]
    base = lambda k: s(k, 300).replace("\\", "/").split("/")[-1]
    d = {}
    if tool in ("Edit", "MultiEdit"):
        d = {"f": base("file_path"), "o": s("old_string", 90), "n": s("new_string", 90)}
    elif tool == "Write":
        d = {"f": base("file_path"), "l": len((i.get("content") or "").splitlines()) if isinstance(i.get("content"), str) else 0}
    elif tool == "Read":
        d = {"f": base("file_path")}
    elif tool in ("Grep", "Glob"):
        d = {"q": s("pattern", 60)}
    elif tool in ("Bash", "PowerShell"):
        d = {"c": s("command", 150)}
    elif tool == "WebSearch":
        d = {"q": s("query", 80)}
    elif tool == "WebFetch":
        d = {"u": s("url", 120)}
    elif tool in ("Agent", "Task"):
        d = {"q": s("description", 70)}
    elif tool == "Skill":
        d = {"q": s("skill", 60)}
    elif tool.startswith("mcp__"):
        d = {k: s(v, 100) for k, v in (("q", "query"), ("u", "url"), ("e", "element"), ("t", "text")) if s(v, 100)}
        d["a"] = tool.split("__")[-1][:40]
    return {k: v for k, v in d.items() if v not in ("", 0)}


def short_target(tool: str, inp: dict) -> str:
    for k in ("file_path", "path", "url", "query", "pattern", "skill", "subagent_type", "description", "command"):
        v = inp.get(k) if isinstance(inp, dict) else None
        if isinstance(v, str) and v:
            v = v.replace("\\", "/")
            if k in ("file_path", "path"):
                v = "/".join(v.split("/")[-2:])
            return v[:90]
    return ""


# ---------- incremental transcript parser ----------
_lock = threading.Lock()
STATE = {"files": {}, "ready": False, "scanned_at": 0}


CACHE_VERSION = 5   # 5: media + skills buildings


def load_cache():
    try:
        d = json.loads(CACHE.read_text(encoding="utf-8"))
        STATE["files"] = d["files"] if d.get("v") == CACHE_VERSION else {}
    except Exception:
        STATE["files"] = {}


def save_cache():
    try:
        CACHE.write_text(json.dumps({"v": CACHE_VERSION, "files": STATE["files"]}, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def new_entry(path: Path):
    parts = path.parts
    is_sub = "subagents" in parts
    session = path.stem
    if is_sub:
        i = parts.index("subagents")
        session = parts[i - 1]
    return {"offset": 0, "session": session, "sub": is_sub, "cwd": "", "first": "", "last": "",
            "sources": {}, "tools": {}, "skills": {}, "agents": {}, "days": {}, "recent": [], "title": "",
            "model": "", "tok": {"in": 0, "out": 0, "cache": 0}, "tokday": {}, "tokmodel": {}, "cur_id": "", "cur_u": None}


def flush_usage(e: dict):
    u = e.get("cur_u")
    if not u:
        return
    e["tok"]["in"] += u[0]; e["tok"]["out"] += u[1]; e["tok"]["cache"] += u[2]
    d = e.get("cur_day") or ""
    if d:
        e["tokday"][d] = e["tokday"].get(d, 0) + u[0] + u[1]
    m = e.get("cur_model") or "?"
    e["tokmodel"][m] = e["tokmodel"].get(m, 0) + u[0] + u[1]
    e["cur_u"] = None


def parse_tail(path: Path, e: dict):
    size = path.stat().st_size
    if size < e["offset"]:
        e.update(new_entry(path))
    if size == e["offset"]:
        return
    with open(path, "rb") as f:
        f.seek(e["offset"])
        data = f.read()
    cut = data.rfind(b"\n")
    if cut < 0:
        return
    e["offset"] += cut + 1
    for raw in data[: cut + 1].splitlines():
        if not raw.strip():
            continue
        # cheap prefilter: only lines that may matter
        if b'"tool_use"' not in raw and b"command-name" not in raw and b'"cwd"' not in raw and b'"usage"' not in raw:
            continue
        try:
            rec = json.loads(raw)
        except Exception:
            continue
        ts = rec.get("timestamp") or ""
        if rec.get("cwd") and not e["cwd"]:
            e["cwd"] = rec["cwd"]
        if ts:
            e["first"] = e["first"] or ts
            e["last"] = max(e["last"], ts)
        msg = rec.get("message") or {}
        content = msg.get("content")
        day = ts[:10]
        if rec.get("type") == "user":
            text = content if isinstance(content, str) else " ".join(
                c.get("text", "") for c in (content or []) if isinstance(c, dict) and c.get("type") == "text")
            for m in re.findall(r"<command-name>/?([\w:\-]+)</command-name>", text or ""):
                e["skills"][m] = e["skills"].get(m, 0) + 1
            continue
        if rec.get("type") == "assistant":
            mdl = msg.get("model") or ""
            if mdl and not mdl.startswith("<"):
                e["model"] = mdl
            u = msg.get("usage") or {}
            mid = msg.get("id") or rec.get("uuid") or ""
            if u and mid:
                cur = [u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0), u.get("output_tokens", 0),
                       u.get("cache_read_input_tokens", 0)]
                if mid != e["cur_id"]:
                    flush_usage(e)
                    e["cur_id"], e["cur_day"], e["cur_model"] = mid, day, e["model"]
                e["cur_u"] = cur
        if not isinstance(content, list):
            continue
        for c in content:
            if not isinstance(c, dict) or c.get("type") != "tool_use":
                continue
            name = c.get("name", "?")
            inp = c.get("input") or {}
            src = source_of(name)
            e["sources"][src] = e["sources"].get(src, 0) + 1
            e["tools"][name] = e["tools"].get(name, 0) + 1
            if day:
                d = e["days"].setdefault(day, {})
                d[src] = d.get(src, 0) + 1
            if name == "Skill" and isinstance(inp, dict) and inp.get("skill"):
                s = inp["skill"]
                e["skills"][s] = e["skills"].get(s, 0) + 1
            if name in ("Agent", "Task") and isinstance(inp, dict):
                a = inp.get("subagent_type") or "general-purpose"
                e["agents"][a] = e["agents"].get(a, 0) + 1
            e["recent"].append({"t": ts, "tool": name, "src": src, "target": short_target(name, inp), "what": describe(name, inp), "d": detail(name, inp)})
        e["recent"] = e["recent"][-25:]


def scan():
    cutoff = time.time() - WINDOW_DAYS * 86400
    seen = set()
    for p in (CLAUDE / "projects").rglob("*.jsonl"):
        try:
            st = p.stat()
        except OSError:
            continue
        if st.st_mtime < cutoff:
            continue
        k = str(p)
        seen.add(k)
        with _lock:
            e = STATE["files"].get(k) or new_entry(p)
        try:
            parse_tail(p, e)
        except Exception:
            pass
        e["mtime"] = st.st_mtime
        with _lock:
            STATE["files"][k] = e
    with _lock:
        for k in list(STATE["files"]):
            if k not in seen:
                del STATE["files"][k]
        STATE["ready"] = True
        STATE["scanned_at"] = time.time()
    save_cache()


def scanner_loop():
    while True:
        try:
            scan()
        except Exception as ex:
            print("scan error:", ex)
        time.sleep(4)


# ---------- inventory ----------
CATS = [
    ("אינסטגרם", r"^ig-|insta"),
    ("וידאו", r"video|watch|reel|montage|remotion"),
    ("עיצוב וממשק", r"design|ui-|ux|frontend|canvas|banner|slides|theme|anatomy|brand-guidelines|art|scroll"),
    ("מסמכים", r"pdf|docx|pptx|xlsx|markitdown|doc-|notebooklm|meeting"),
    ("שיווק ותוכן", r"ad-|copy|seo|landing|email|whatsapp|hook|content|brand|competitor|market|cmo|growth"),
    ("תלת-ממד והדפסה", r"cad|gcode|bambu|dxf|urdf|srdf|sdf"),
    ("קוד וידע", r"graphify|code|review|grill|vibesec|simplify|debug|skill|prompt|depth|arena|workflow|find-skills|uv|docker|progress"),
    ("משפטי וכספי", r"legal|financial|trader|tash|yad2"),
]


def category(name: str) -> str:
    n = name.lower()
    for label, rx in CATS:
        if re.search(rx, n):
            return label
    return "כללי"


def frontmatter(md: Path) -> dict:
    try:
        txt = md.read_text(encoding="utf-8", errors="ignore").lstrip("\ufeff")
    except Exception:
        return {}
    m = re.match(r"---\s*\n(.*?)\n---", txt, re.S)
    if not m:
        return {}
    out, key = {}, None
    for line in m.group(1).splitlines():
        km = re.match(r"^([\w-]+):\s*(.*)$", line)
        if km:
            key = km.group(1)
            v = km.group(2).strip()
            out[key] = "" if v in (">", "|", ">-", "|-") else v.strip("'\"")
        elif key and line.startswith(" "):
            out[key] = (out[key] + " " + line.strip()).strip()
    return out


ARCHIVE = CLAUDE / "skills-archive"
ALLOW = CLAUDE / "skills-allowlist.txt"


def skill_he():
    try:
        return json.loads((HERE / "skill_he.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def move_skill(name: str, archive: bool) -> bool:
    # must start with a letter/digit: "." or ".." would otherwise resolve to the whole skills folder
    if not re.fullmatch(r"[A-Za-z0-9][\w.\-]*", name):
        return False
    src, dst = (CLAUDE / "skills" / name, ARCHIVE / name) if archive else (ARCHIVE / name, CLAUDE / "skills" / name)
    if src.parent not in (CLAUDE / "skills", ARCHIVE) or dst.parent not in (CLAUDE / "skills", ARCHIVE):
        return False
    if not src.is_dir() or dst.exists():
        return False
    dst.parent.mkdir(exist_ok=True)
    src.rename(dst)
    lines = ALLOW.read_text(encoding="utf-8").splitlines() if ALLOW.exists() else []
    lines = [l for l in lines if l.strip() != name]
    if not archive:
        lines.append(name)
    ALLOW.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


def inventory():
    he = skill_he()
    skills = []
    for d in sorted((CLAUDE / "skills").iterdir() if (CLAUDE / "skills").exists() else []):
        md = d / "SKILL.md"
        if d.is_dir() and md.exists():
            fm = frontmatter(md)
            name = fm.get("name") or d.name
            desc = fm.get("description") or ""
            skills.append({"name": d.name, "desc": desc[:220], "he": he.get(d.name) or desc.split(".")[0][:60],
                           "cat": category(d.name), "mtime": md.stat().st_mtime,
                           "age_days": int((time.time() - md.stat().st_mtime) / 86400)})
    archived = sorted(p.name for p in ARCHIVE.iterdir() if p.is_dir()) if ARCHIVE.exists() else []
    agents = []
    for f in sorted((CLAUDE / "agents").glob("*.md")):
        fm = frontmatter(f)
        agents.append({"name": f.stem, "desc": (fm.get("description") or "")[:160]})
    mcps = []
    try:
        cj = json.loads((HOME / ".claude.json").read_text(encoding="utf-8"))
        for n, cfg in (cj.get("mcpServers") or {}).items():
            mcps.append({"name": n, "kind": cfg.get("type") or ("stdio" if cfg.get("command") else "http")})
    except Exception:
        pass
    plugins = []
    try:
        ip = json.loads((CLAUDE / "plugins" / "installed_plugins.json").read_text(encoding="utf-8"))
        for n in (ip.get("plugins") or ip).keys():
            plugins.append(n)
    except Exception:
        pass
    graphs = []
    for d in sorted(PROJECTS_ROOT.iterdir()):
        if d.is_dir() and not d.name.startswith("."):
            g = d / "graphify-out" / "graph.json"
            graphs.append({"project": d.name, "graph": g.exists(),
                           "graph_mtime": g.stat().st_mtime if g.exists() else None})
    return skills, agents, mcps, plugins, graphs, archived


# ---------- proposals ----------
PROP_RX = re.compile(r"^- \[( |x)\] \*\*(P-\d+)\*\*\s*`?(\w+)`?\s*·\s*(\w+)\s*·\s*(\S+)\s*—\s*\*\*(.+?)\*\*(.*)$")


def proposals():
    out = []
    if not PROPOSALS.exists():
        return out
    group = ""
    for line in PROPOSALS.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            group = line[3:].strip()
        m = PROP_RX.match(line)
        if not m:
            continue
        checked, pid, mode, size, risk, title, rest = m.groups()
        if "DONE" in rest or "✅" in rest:
            status = "done"
        elif "🚫" in rest or "ארכיון" in rest or "לא-שמיש" in rest:
            status = "dropped"
        elif "WAITING" in rest or "⏳" in rest:
            status = "waiting"
        elif checked == "x":
            status = "approved"
        else:
            status = "open"
        out.append({"id": pid, "mode": mode, "size": size, "risk": risk, "title": title.strip(),
                    "note": re.sub(r"\s+", " ", rest).strip()[:120], "status": status, "group": group})
    return out


def set_proposal(pid: str, approve: bool) -> bool:
    txt = PROPOSALS.read_text(encoding="utf-8")
    a, b = ("- [ ] **%s**" % pid, "- [x] **%s**" % pid) if approve else ("- [x] **%s**" % pid, "- [ ] **%s**" % pid)
    if a not in txt:
        return False
    PROPOSALS.write_text(txt.replace(a, b, 1), encoding="utf-8")
    return True


VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".mp3", ".m4a", ".wav", ".ogg", ".opus"}


def improve_state():
    """The self-improvement pipeline: videos -> transcripts -> insights -> proposals -> apply."""
    def stems(folder, exts=None):
        d = IMPROVE / folder
        if not d.exists():
            return {}
        return {p.stem: p.stat().st_mtime for p in d.iterdir()
                if p.is_file() and (exts is None or p.suffix.lower() in exts)}
    vids = stems("videos", VIDEO_EXT)
    trs = stems("transcripts", {".txt"})
    ins = stems("insights", {".md"})
    no_audio = set()
    for s in trs:
        try:
            if "[NO AUDIO TRACK]" in (IMPROVE / "transcripts" / f"{s}.txt").read_text(encoding="utf-8", errors="ignore")[:200]:
                no_audio.add(s)
        except Exception:
            pass
    parking = []
    if PROPOSALS.exists():
        txt = PROPOSALS.read_text(encoding="utf-8")
        if "## 🅿️ חניה" in txt:
            parking = [l[2:].strip() for l in txt.split("## 🅿️ חניה", 1)[1].splitlines() if l.startswith("- ")][:30]
    needs = []
    nf = HERE / "scout" / "needs.md"
    if nf.exists():
        proj = ""
        for l in nf.read_text(encoding="utf-8").splitlines():
            if l.startswith("## "):
                proj = l[3:].strip()
            elif l.startswith("- ") and proj:
                needs.append({"project": proj, "need": l[2:].strip()})
    skip_file = IMPROVE / "insights" / "_skipped.txt"
    skipped = set(skip_file.read_text(encoding="utf-8").split("\n")) if skip_file.exists() else set()
    no_audio |= {s for s in trs if s in skipped}

    def nice(s):
        return re.sub(r"^WhatsApp Video (\S+) at (\S+)", r"\1  \2", s)
    return {
        "videos": len(vids), "transcripts": len(trs), "insights": len(ins), "no_audio": len(no_audio),
        "pending_transcribe": [nice(s) for s in sorted(set(vids) - set(trs), key=lambda k: -vids[k])][:20],
        "pending_insight": [nice(s) for s in sorted(set(trs) - set(ins) - no_audio, key=lambda k: -trs[k])][:20],
        "recent_insights": [nice(s) for s in sorted(ins, key=lambda k: -ins[k])][:8],
        "parking": parking, "needs": needs,
        "last_video": max(vids.values()) if vids else None,
    }


SCOUT = HERE / "scout.json"


def scout_report():
    """Written weekly by the skill scout (see scout/README.md); read-only here."""
    try:
        return json.loads(SCOUT.read_text(encoding="utf-8"))
    except Exception:
        return None


# ---------- state assembly ----------
def build_state():
    now = time.time()
    with _lock:
        files = [dict(v) for v in STATE["files"].values()]
        ready, scanned = STATE["ready"], STATE["scanned_at"]
    sessions = {}
    for e in files:
        s = sessions.setdefault(e["session"], {"id": e["session"], "cwd": "", "first": "", "last": "",
                                               "mtime": 0, "sources": Counter(), "skills": Counter(),
                                               "agents": Counter(), "tools": Counter(), "recent": [], "subs": 0, "model": "", "model_t": 0, "tok": [0, 0, 0],
                                               "helpers": []})
        if e["sub"] and now - e.get("mtime", 0) < 120:
            s["helpers"].append(e["recent"][-1] if e["recent"] else {"tool": "", "src": "other", "target": ""})
        s["cwd"] = s["cwd"] or e.get("cwd", "")
        s["first"] = min(filter(None, [s["first"], e["first"]]), default="")
        s["last"] = max(s["last"], e["last"])
        s["mtime"] = max(s["mtime"], e.get("mtime", 0))
        if not e["sub"] and e.get("model") and e.get("mtime", 0) >= s["model_t"]:
            s["model"], s["model_t"] = e["model"], e.get("mtime", 0)
        cu = e.get("cur_u") or [0, 0, 0]
        s["tok"][0] += e["tok"]["in"] + cu[0]; s["tok"][1] += e["tok"]["out"] + cu[1]; s["tok"][2] += e["tok"]["cache"] + cu[2]
        s["sources"].update(e["sources"]); s["skills"].update(e["skills"])
        s["agents"].update(e["agents"]); s["tools"].update(e["tools"])
        s["recent"] += e["recent"]
        s["subs"] += 1 if e["sub"] else 0
    out_sessions = []
    skill_use, agent_use, src_total = Counter(), Counter(), Counter()
    daily = defaultdict(Counter)
    for e in files:
        for d, m in e["days"].items():
            daily[d].update(m)
    for s in sessions.values():
        skill_use.update(s["skills"]); agent_use.update(s["agents"]); src_total.update(s["sources"])
        age = now - s["mtime"]
        status = "working" if age < 90 else ("idle" if age < 1800 else "closed")
        s["recent"].sort(key=lambda r: r["t"])
        out_sessions.append({
            "id": s["id"][:8], "project": Path(s["cwd"]).name if s["cwd"] else "?", "cwd": s["cwd"],
            "first": s["first"], "last": s["last"], "status": status, "age": int(age),
            "sources": dict(s["sources"]), "skills": dict(s["skills"].most_common(8)),
            "agents": dict(s["agents"]), "subs": s["subs"], "total": sum(s["sources"].values()),
            "top_tools": dict(s["tools"].most_common(6)), "recent": s["recent"][-14:],
            "helpers": s["helpers"], "model": s["model"], "tok": {"in": s["tok"][0], "out": s["tok"][1], "cache": s["tok"][2]},
        })
    out_sessions.sort(key=lambda x: x["last"], reverse=True)
    tokday, tokmodel = Counter(), Counter()
    for e in files:
        for d, v in e.get("tokday", {}).items():
            tokday[d] += v
        for m, v in e.get("tokmodel", {}).items():
            tokmodel[m] += v
        cu = e.get("cur_u")
        if cu and e.get("cur_day"):
            tokday[e["cur_day"]] += cu[0] + cu[1]
            tokmodel[e.get("cur_model") or "?"] += cu[0] + cu[1]
    today = time.strftime("%Y-%m-%d", time.gmtime())
    tokens = {"today": tokday.get(today, 0), "max_day": max(tokday.values(), default=0), "total": sum(tokday.values()),
              "by_model": dict(tokmodel), "days": {d: tokday[d] for d in sorted(tokday)[-14:]}}
    skills, agents, mcps, plugins, graphs, archived = inventory()
    for sk in skills:
        sk["uses"] = skill_use.get(sk["name"], 0)
    for ag in agents:
        ag["uses"] = agent_use.get(ag["name"], 0)
    return {
        "ready": ready, "scanned_at": scanned, "window_days": WINDOW_DAYS,
        "sessions": out_sessions[:40], "skills": skills, "agents": agents, "mcps": mcps,
        "plugins": plugins, "graphs": graphs, "proposals": proposals(), "archived": archived,
        "scout": scout_report(), "improve": improve_state(),
        "sources_total": dict(src_total), "tokens": tokens,
        "daily": {d: dict(daily[d]) for d in sorted(daily)[-WINDOW_DAYS:]},
        "builtin_agents_used": {k: v for k, v in agent_use.items() if k not in {a["name"] for a in agents}},
    }


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        b = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    # Only the dashboard itself may talk to this server. A web page you visit can still send requests to
    # 127.0.0.1 (CSRF) or point its own hostname at it (DNS rebinding): both carry a foreign Host/Origin.
    def _trusted(self, post=False):
        ok_hosts = (f"127.0.0.1:{PORT}", f"localhost:{PORT}")
        if self.headers.get("Host", "") not in ok_hosts:
            return False
        if post:
            if self.headers.get("Origin", "") not in tuple("http://" + h for h in ok_hosts):
                return False
            if not (self.headers.get("Content-Type", "") or "").startswith("application/json"):
                return False
        return True

    def do_GET(self):
        if not self._trusted():
            return self._send(403, "{}")
        if self.path.startswith("/api/state"):
            return self._send(200, json.dumps(build_state(), ensure_ascii=False))
        if self.path in ("/", "/index.html"):
            return self._send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
        if self.path.startswith("/api/shots"):
            shots = []
            # os.walk with onerror=None skips unreadable/too-long paths (rglob crashed on a Flutter build dir);
            # heavy build/dependency folders are pruned so this stays fast.
            SKIP = {"node_modules", ".git", "build", ".dart_tool", ".gradle", "venv", ".venv", "__pycache__", "dist", "Pods"}
            for root, dirs, files in os.walk(PROJECTS_ROOT, onerror=lambda e: None):
                dirs[:] = [d for d in dirs if d not in SKIP]
                if os.path.basename(root) != ".playwright-mcp":
                    continue
                for f in files:
                    if f.lower().endswith((".jpeg", ".jpg", ".png")):
                        p = Path(root) / f
                        try:
                            shots.append((p.stat().st_mtime, p))
                        except OSError:
                            pass
            shots.sort(reverse=True)
            out = [{"t": t, "u": "/api/img?p=" + urllib.parse.quote(str(p.relative_to(PROJECTS_ROOT)).replace("\\", "/"))} for t, p in shots[:8]]
            return self._send(200, json.dumps(out))
        if self.path.startswith("/api/img"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("p", [""])[0]
            wq = PureWindowsPath(q)
            if not q or wq.anchor or ".." in wq.parts:   # no drive/UNC/absolute paths (resolve() could reach out over SMB)
                return self._send(404, "{}")
            f = (PROJECTS_ROOT / q).resolve()
            if f.suffix.lower() in (".jpeg", ".jpg", ".png") and ".playwright-mcp" in f.parts and PROJECTS_ROOT.resolve() in f.parents and f.exists():
                return self._send(200, f.read_bytes(), "image/png" if f.suffix.lower() == ".png" else "image/jpeg")
            return self._send(404, "{}")
        if re.fullmatch(r"/[\w\-]+\.js", self.path) and (HERE / self.path[1:]).exists():
            return self._send(200, (HERE / self.path[1:]).read_bytes(), "text/javascript; charset=utf-8")
        self._send(404, "{}")

    def do_POST(self):
        if not self._trusted(post=True):
            return self._send(403, "{}")
        if self.path.startswith("/api/skill"):
            n = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
                ok = move_skill(str(body["name"]), body.get("action") == "archive")
            except Exception:
                ok = False
            return self._send(200 if ok else 400, json.dumps({"ok": ok}))
        if self.path.startswith("/api/proposal"):
            n = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
                ok = set_proposal(str(body["id"]), bool(body["approve"]))
            except Exception:
                ok = False
            return self._send(200 if ok else 400, json.dumps({"ok": ok}))
        self._send(404, "{}")


if __name__ == "__main__":
    import sys, webbrowser
    ThreadingHTTPServer.allow_reuse_address = False  # on Windows, reuse would let two servers share a port
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    except OSError:
        print(f"Port {PORT} is busy: the Control Room may already be running (open http://localhost:{PORT}),")
        print("or another program uses it. To use another port, run install.ps1 -Port <number>.")
        if "--open" in sys.argv:
            webbrowser.open(f"http://localhost:{PORT}")
        sys.exit(1)
    load_cache()
    threading.Thread(target=scanner_loop, daemon=True).start()
    print(f"Control Room on http://localhost:{PORT}")
    if "--open" in sys.argv:
        webbrowser.open(f"http://localhost:{PORT}")
    httpd.serve_forever()
