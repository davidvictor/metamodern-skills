#!/usr/bin/env python3
"""Bring Claude desktop Code sessions from one account to another on this Mac.

The desktop app lists Code sessions per account and organization, in
~/Library/Application Support/Claude/claude-code-sessions/<account>/<org>/local_*.json.
Each file is a small pointer (title, folder, transcript id). The transcript itself is in
~/.claude/projects, which every account on the Mac shares, so copying the pointer is
enough for the session to open and continue in the other account. Nothing in the source
account is ever changed, and nothing already in the destination is overwritten.

  sessions.py accounts
  sessions.py copy <from> <to> [--since DAYS|YYYY-MM-DD] [--folder PATH ...]
                   [--filter FILE] [--include-empty] [--dry-run]
  sessions.py undo <to> [--force]

<from> and <to> are an account folder ("<account>/<org>") or the start of one, as
`accounts` prints them. `current` means the account the desktop app is signed in to now.

Environment overrides, for tests: METAMODERN_SESSIONS_ROOT (the claude-code-sessions
folder), METAMODERN_DESKTOP_CONFIG (the app's config.json), METAMODERN_CLAUDE_DIR
(~/.claude), METAMODERN_CLAUDE_JSON (~/.claude.json) and METAMODERN_STATE_DIR (where undo
lists are kept).
"""
import glob, hashlib, json, os, re, shutil, sys, time
from datetime import datetime

HOME = os.path.expanduser("~")
APP_DIR = os.path.join(HOME, "Library", "Application Support", "Claude")
ROOT = os.environ.get("METAMODERN_SESSIONS_ROOT") or os.path.join(APP_DIR, "claude-code-sessions")
DESKTOP_CONFIG = os.environ.get("METAMODERN_DESKTOP_CONFIG") or os.path.join(APP_DIR, "config.json")
CLAUDE_DIR = os.environ.get("METAMODERN_CLAUDE_DIR") or os.path.join(HOME, ".claude")
CLAUDE_JSON = os.environ.get("METAMODERN_CLAUDE_JSON") or os.path.join(HOME, ".claude.json")
STATE_DIR = os.environ.get("METAMODERN_STATE_DIR") or os.path.join(
    HOME, ".local", "state", "metamodern-switch-account")


def when(ms):
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M") if ms else "-"


def tilde(path):
    return path.replace(HOME, "~", 1) if path.startswith(HOME) else path


def read_json(path):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return {}


def signed_in():
    """The account folder the desktop app shows now, and its email when known. The app
    records its account but not its organization; Claude Code's own sign-in in
    ~/.claude.json supplies the organization (and email) when it is the same account,
    which it is unless the two were signed in separately."""
    cli = read_json(CLAUDE_JSON).get("oauthAccount") or {}
    acct = read_json(DESKTOP_CONFIG).get("lastKnownAccountUuid") or cli.get("accountUuid")
    if not acct:
        return None, None
    same = acct == cli.get("accountUuid")
    if same and cli.get("organizationUuid") and os.path.isdir(os.path.join(ROOT, acct, cli["organizationUuid"])):
        return f"{acct}/{cli['organizationUuid']}", cli.get("emailAddress")
    orgs = [f for f in folders() if f.startswith(acct + "/")]
    orgs.sort(key=lambda f: max((activity(s) for _, s in read_sessions(os.path.join(ROOT, f))), default=0), reverse=True)
    return (orgs[0] if orgs else None), (cli.get("emailAddress") if same else None)


def read_sessions(folder):
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "local_*.json"))):
        try:
            out.append((f, json.load(open(f))))
        except (OSError, ValueError):
            continue
    return out


def activity(s):
    return s.get("lastActivityAt") or s.get("createdAt") or 0


def folders():
    out = []
    for d in sorted(glob.glob(os.path.join(ROOT, "*", "*"))):
        if os.path.isdir(d):
            out.append(os.path.relpath(d, ROOT))
    return out


def resolve(name):
    if name == "current":
        cur, _ = signed_in()
        if not cur or not os.path.isdir(os.path.join(ROOT, cur)):
            sys.exit("Can't tell which account is signed in now; give its folder from `accounts`.")
        return os.path.join(ROOT, cur)
    hits = [f for f in folders() if f.startswith(name)]
    if len(hits) != 1:
        sys.exit(f"'{name}' matches {len(hits)} account folders; run `accounts` and give more of it.")
    return os.path.join(ROOT, hits[0])


def transcript_ok(s):
    sid = s.get("cliSessionId")
    return bool(sid) and bool(glob.glob(os.path.join(CLAUDE_DIR, "projects", "*", f"{sid}.jsonl")))


def folder_of(s):
    return s.get("originCwd") or s.get("cwd") or ""


def load_filter(path):
    """Folder lines match a session started in that folder or below it. `title:` lines are
    case-insensitive regular expressions searched in the session's title."""
    paths, titles = [], []
    for line in open(os.path.expanduser(path)):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("title:"):
            titles.append(re.compile(line[6:].strip(), re.I))
        else:
            paths.append(os.path.expanduser(line).rstrip("/"))
    return paths, titles


def matches(s, paths, titles):
    if not paths and not titles:
        return True
    cwd = folder_of(s)
    if any(cwd == p or cwd.startswith(p + "/") or cwd.startswith(p + "-") for p in paths):
        return True
    return any(t.search(s.get("title") or "") for t in titles)


def since_ms(value):
    if re.fullmatch(r"\d+", value):
        return (time.time() - int(value) * 86400) * 1000
    try:
        return datetime.strptime(value, "%Y-%m-%d").timestamp() * 1000
    except ValueError:
        sys.exit("--since takes a number of days or a date like 2026-10-19.")


def undo_path(dst):
    return os.path.join(STATE_DIR, os.path.relpath(dst, ROOT).replace("/", "_") + ".tsv")


def read_undo(dst):
    """Newest record per copied file name: {name: (stamp, sha256)}."""
    records = {}
    if os.path.exists(undo_path(dst)):
        for line in open(undo_path(dst)):
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 3:
                records[parts[1]] = (parts[0], parts[2])
    return records


def write_undo(dst, records):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(undo_path(dst), "w") as log:
        log.writelines(f"{stamp}\t{name}\t{h}\n" for name, (stamp, h) in records.items())


def digest(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def cmd_accounts():
    cur, email = signed_in()
    print("Session lists on this Mac (the app shows the one for the account it is signed in to):")
    for rel in folders():
        rows = read_sessions(os.path.join(ROOT, rel))
        rows.sort(key=lambda r: activity(r[1]), reverse=True)
        tag = (f"  <- signed in now ({email})" if email else "  <- signed in now") if rel == cur else ""
        print(f"\n{rel}{tag}")
        if not rows:
            print("  no sessions")
            continue
        print(f"  {len(rows)} sessions, last active {when(activity(rows[0][1]))}")
        for _, s in rows[:3]:
            print(f"    {when(activity(s))}  {s.get('title') or '(untitled)'}  [{tilde(folder_of(s))}]")


def cmd_copy(args):
    src, dst = resolve(args[0]), resolve(args[1])
    if src == dst:
        sys.exit("From and to are the same account folder.")
    opts = args[2:]
    dry, include_empty = "--dry-run" in opts, "--include-empty" in opts
    paths, titles = [], []
    after = 0
    i = 0
    while i < len(opts):
        o = opts[i]
        if o in ("--since", "--folder", "--filter") and i + 1 >= len(opts):
            sys.exit(f"{o} needs a value.")
        if o == "--since":
            after = since_ms(opts[i + 1]); i += 1
        elif o == "--folder":
            paths.append(os.path.expanduser(opts[i + 1]).rstrip("/")); i += 1
        elif o == "--filter":
            p, t = load_filter(opts[i + 1]); paths += p; titles += t; i += 1
        elif o not in ("--dry-run", "--include-empty"):
            sys.exit(f"Unknown option {o}.")
        i += 1

    picked, present, continued, empty, outside = [], 0, [], 0, 0
    for f, s in read_sessions(src):
        if activity(s) < after or not matches(s, paths, titles):
            outside += 1
            continue
        target = os.path.join(dst, os.path.basename(f))
        if os.path.exists(target):
            present += 1
            try:
                mine = json.load(open(target))
                if activity(s) > activity(mine):
                    continued.append((s, mine))
            except (OSError, ValueError):
                pass
            continue
        if not transcript_ok(s):
            empty += 1
            if not include_empty:
                continue
        picked.append((f, target, s))

    by_folder = {}
    for _, _, s in picked:
        k = tilde(folder_of(s) or "?")
        by_folder[k] = by_folder.get(k, 0) + 1
    print(f"From {os.path.relpath(src, ROOT)}")
    print(f"To   {os.path.relpath(dst, ROOT)}\n")
    for k, v in sorted(by_folder.items()):
        print(f"  {v:>4}  {k}")
    print(f"\n  {len(picked)} to copy; {present} already there; {outside} outside the date or folders asked for;"
          f" {empty} with no transcript on this Mac" + (" (copied anyway)" if include_empty else " (left out)"))
    for s, mine in continued:
        print(f"  Continued in the other account since: \"{s.get('title')}\" (there {when(activity(s))},"
              f" here {when(activity(mine))}). It opens with every turn; only its date in the list is older.")
    if dry or not picked:
        if dry:
            print("\nDry run: nothing copied.")
        return

    os.makedirs(STATE_DIR, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d %H:%M")
    records = read_undo(dst)
    copied = 0
    for f, target, s in picked:
        # Remote Control handles belong to the old account's server sessions; the new
        # account starts its own. The transcript id (cliSessionId) is what must carry.
        s = dict(s, bridgeSessionIds=[])
        tmp = os.path.join(dst, f".copying-{os.path.basename(target)}")
        with open(tmp, "w") as out:
            json.dump(s, out)
        try:
            os.link(tmp, target)  # fails if the app created the entry meanwhile: never clobber
        except FileExistsError:
            continue
        finally:
            os.remove(tmp)
        shutil.copystat(f, target)
        records[os.path.basename(target)] = (stamp, digest(target))
        copied += 1
    write_undo(dst, records)
    print(f"\nCopied {copied}. Undo list: {tilde(undo_path(dst))}")
    print("Quit the Claude app completely and reopen it to see them; it reads the list only when it starts.")


def cmd_undo(args):
    dst = resolve(args[0])
    force = "--force" in args[1:]
    records = read_undo(dst)
    if not records:
        sys.exit(f"No copies recorded into {os.path.relpath(dst, ROOT)}.")
    removed, kept, keep = 0, 0, {}
    for name, (stamp, h) in records.items():
        p = os.path.join(dst, name)
        if not os.path.exists(p):
            continue
        if digest(p) != h and not force:
            kept += 1  # used in this account since the copy
            keep[name] = (stamp, h)
            continue
        os.remove(p)
        removed += 1
    write_undo(dst, keep)
    print(f"Removed {removed} copied sessions."
          + (f" Kept {kept} used since the copy (--force removes them too)." if kept else "")
          + " Restart the app to see the change.")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["accounts"]:
        cmd_accounts()
    elif a[:1] == ["copy"] and len(a) >= 3:
        cmd_copy(a[1:])
    elif a[:1] == ["undo"] and len(a) >= 2:
        cmd_undo(a[1:])
    else:
        print(__doc__.split("\n\n", 2)[2])
        sys.exit(1)
