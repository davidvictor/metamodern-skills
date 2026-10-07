#!/usr/bin/env python3
# Managed by metamodern-configure-engineering
"""Portable Metamodern profile rendering, installation, and verification."""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import textwrap
import tomllib

MARKER = "Managed by metamodern-configure-engineering"
PROFILE_PATH = "docs/engineering/profile.json"
LINK_START = "<!-- metamodern-engineering:start -->"
LINK_END = "<!-- metamodern-engineering:end -->"


def digest(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_path(root, relative):
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise ValueError(f"Path escapes project: {relative}")
    for part in [path, *path.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise ValueError(f"Symlink is not a managed target: {relative}")
    if path.exists() and not path.is_file():
        raise ValueError(f"Expected a regular file: {relative}")
    return path


def quoted(value):
    return json.dumps(value, ensure_ascii=False)


def toml_key(value):
    return value if re.fullmatch(r"[A-Za-z0-9_-]+", value) else quoted(value)


def toml_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return quoted(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return str(value).lower()
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{toml_key(k)} = {toml_value(v)}" for k, v in value.items()) + " }"
    raise ValueError(f"Unsupported TOML value: {type(value).__name__}")


def dump_toml(data):
    lines = []

    def table(mapping, keys):
        if keys:
            lines.append("[" + ".".join(toml_key(key) for key in keys) + "]")
        for key, value in mapping.items():
            if not isinstance(value, dict):
                lines.append(f"{toml_key(key)} = {toml_value(value)}")
        lines.append("")
        for key, value in mapping.items():
            if isinstance(value, dict):
                table(value, [*keys, key])

    table(data, [])
    return "\n".join(lines).rstrip() + "\n"


def load_availability(path):
    if path is None:
        return None
    data = read_json(Path(path))
    providers = data.get("providers")
    if not isinstance(providers, dict):
        raise ValueError("Availability must contain a providers object")
    for name, provider in providers.items():
        if name not in ("codex", "claude-code"):
            continue
        if not isinstance(provider, dict) or not isinstance(provider.get("models"), list):
            raise ValueError(f"Invalid availability provider: {name}")
        if not isinstance(provider.get("source"), str) or not provider["source"].strip() or not isinstance(provider.get("verified_at"), str):
            raise ValueError(f"Availability provider {name} needs source and verified_at")
        parse_verified_at(provider["verified_at"])
        seen = set()
        for model in provider["models"]:
            if not isinstance(model, dict) or not isinstance(model.get("id"), str):
                raise ValueError(f"Invalid model in {name}")
            efforts = model.get("reasoning_efforts")
            if not isinstance(efforts, list) or not efforts or not all(isinstance(x, str) for x in efforts):
                raise ValueError(f"Model {model['id']} needs reasoning_efforts")
            if model["id"] in seen:
                raise ValueError(f"Duplicate model {model['id']} in {name}")
            seen.add(model["id"])
    return data


def parse_verified_at(value):
    try:
        stamp = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("verified_at must be a timezone-aware ISO8601 timestamp") from None
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("verified_at must include its timezone")
    now = datetime.datetime.now(datetime.timezone.utc)
    if stamp > now + datetime.timedelta(minutes=5):
        raise ValueError("verified_at is more than five minutes in the future")
    return stamp


def evidence_problem(policy, record):
    if record.get("status", "verified") != "verified" or record.get("verified", True) is not True:
        return "Provider evidence is explicitly unverified"
    stamp = parse_verified_at(record["verified_at"])
    age = datetime.datetime.now(datetime.timezone.utc) - stamp
    if age > datetime.timedelta(hours=policy["availability_max_age_hours"]):
        return f"Provider evidence is stale (older than {policy['availability_max_age_hours']} hours)"
    return None


def selected_models(policy, previous, evidence):
    low = previous.get("selected_models", {}).get("low_codex", policy["low_codex_fallback"])
    provider = (evidence or {}).get("providers", {}).get("codex")
    if provider is not None and evidence_problem(policy, provider) is None:
        supported = {m["id"] for m in provider["models"] if "low" in m["reasoning_efforts"]}
        low = next((name for name in policy["low_codex_candidates"] if name in supported), low)
    if low not in policy["low_codex_candidates"]:
        raise ValueError("Existing low Codex selection is outside profile policy")
    return {"low_codex": low}


def model_for(policy, selections, provider, effort):
    if effort == "low":
        return selections["low_codex"] if provider == "codex" else policy["low_claude_model"]
    return policy["default"][provider]


def availability_result(policy, selections, evidence):
    result = {}
    for provider in ("codex", "claude-code"):
        record = (evidence or {}).get("providers", {}).get(provider)
        if record is None:
            result[provider] = {"status": "not_verified", "reason": "No provider availability evidence supplied"}
            continue
        problem = evidence_problem(policy, record)
        if problem:
            result[provider] = {"status": "not_verified", "reason": problem,
                                "source": record["source"], "verified_at": record["verified_at"]}
            continue
        models = {model["id"]: model["reasoning_efforts"] for model in record["models"]}
        required = {(policy["lead"][provider], policy["lead"]["effort"]),
                    (policy["default"][provider], policy["default"]["effort"])}
        required.update((model_for(policy, selections, provider, r["effort"]), r["effort"])
                        for r in policy["roles"].values())
        missing = [f"{model}/{effort}" for model, effort in sorted(required)
                   if effort not in models.get(model, [])]
        result[provider] = {"status": "unsupported" if missing else "verified",
                            "verification_scope": "model_catalog", "provider_execution": "not_verified",
                            "source": record["source"], "verified_at": record["verified_at"],
                            "unsupported": missing}
    return result


def role_toml(policy, selections, role):
    return f"# {MARKER}\n" + dump_toml({
        "name": role["name"],
        "description": role["description"],
        "model": model_for(policy, selections, "codex", role["effort"]),
        "model_reasoning_effort": role["effort"],
        "sandbox_mode": role["sandbox_mode"],
        "developer_instructions": policy["instruction"],
    })


def role_markdown(policy, role):
    model = model_for(policy, {}, "claude-code", role["effort"])
    # Claude permissions are untouched; read-only specialist scope is an instruction.
    scope = "Remain read-only; do not modify project files." if role["sandbox_mode"] == "read-only" else "Edit only task-owned resources within current authorization."
    tools = "tools: Read, Grep, Glob, WebFetch, WebSearch, LSP\n" if role["sandbox_mode"] == "read-only" else ""
    return (f"---\nname: {role['name']}\ndescription: {quoted(role['description'])}\n"
            f"model: {model}\neffort: {role['effort']}\n{tools}---\n\n<!-- {MARKER} -->\n\n"
            f"{role['description']}\n\n{scope}\n\n{policy['instruction']}\n")


def linked_document(content, policy):
    block = (f"{LINK_START}\n## Engineering profile\n\n"
             "Follow [the engineering guide](docs/engineering/README.md) and "
             "[testing policy](docs/engineering/testing-policy.md). "
             "Check configuration with `python3 scripts/check-engineering.py --project .`.\n\n"
             f"The lead uses Codex `{policy['lead']['codex']}` or Claude Code `{policy['lead']['claude-code']}` "
             f"at `{policy['lead']['effort']}` effort. Delegated default agents use `{policy['default']['effort']}` effort.\n"
             f"{LINK_END}")
    if LINK_START in content or LINK_END in content:
        if content.count(LINK_START) != 1 or content.count(LINK_END) != 1:
            raise ValueError("Malformed engineering linkage block")
        pattern = re.escape(LINK_START) + r".*?" + re.escape(LINK_END)
        if not re.search(pattern, content, re.S):
            raise ValueError("Malformed engineering linkage order")
        return re.sub(pattern, lambda _: block, content, flags=re.S)
    return content.rstrip() + "\n\n" + block + "\n"


def routing_conflicts(root, policy, previous):
    """Shared config fields are replaceable only through explicit routing adoption."""
    config_path = safe_path(root, ".codex/config.toml")
    config = tomllib.loads(config_path.read_text()) if config_path.exists() else {}
    settings_path = safe_path(root, ".claude/settings.json")
    settings = read_json(settings_path) if settings_path.exists() else {}
    if not isinstance(config.get("agents", {}), dict) or not isinstance(settings, dict):
        raise ValueError("Native config agents/settings must be objects")
    conflicts = []
    for label, container, key, expected in (
        (".codex/config.toml", config, "model", policy["lead"]["codex"]),
        (".codex/config.toml", config, "model_reasoning_effort", policy["lead"]["effort"]),
        (".codex/config.toml agents", config.get("agents", {}), "default_subagent_model", policy["default"]["codex"]),
        (".codex/config.toml agents", config.get("agents", {}), "default_subagent_reasoning_effort", policy["default"]["effort"]),
        (".claude/settings.json", settings, "model", policy["lead"]["claude-code"]),
        (".claude/settings.json", settings, "effortLevel", policy["lead"]["effort"]),
    ):
        if key in container and container[key] != expected:
            conflicts.append(f"Routing conflict {label}.{key}: {container[key]!r} -> {expected!r}")
    prior_policy = previous.get("policy")
    if prior_policy:
        prior_roles = {"default": {"description": "General implementation agent."}, **prior_policy["roles"]}
        for name in ["default", *policy["roles"]]:
            if name not in prior_roles:
                continue
            registration = config.get("agents", {}).get(name, {})
            if not isinstance(registration, dict):
                raise ValueError(f"Codex agents.{name} must be a table")
            for key, prior_expected in (("config_file", f"agents/{name}.toml"),
                                        ("description", prior_roles[name]["description"])):
                if registration.get(key) != prior_expected:
                    expected = f"agents/{name}.toml" if key == "config_file" else policy["roles"].get(name, {"description": "General implementation agent."})["description"]
                    conflicts.append(f"Routing conflict .codex/config.toml agents.{name}.{key}: {registration.get(key)!r} -> {expected!r}")
    return conflicts


def claude_identity(content):
    """Read a top-level YAML frontmatter name without depending on a YAML package."""
    frontmatter = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", content, re.S)
    if not frontmatter:
        return None
    metadata = textwrap.dedent(frontmatter[1])
    if re.search(r"(?m)^(?:[?&*!%{\[]|<<[ \t]*:)", metadata):
        raise ValueError("Unsupported Claude agent identity syntax: complex keys, aliases, or YAML merges")
    match = re.search(r'''(?m)^(?:name|"name"|'name')[ \t]*:[ \t]*(.*?)[ \t]*$''', metadata)
    if not match:
        if re.search(r'''(?m)^["'][^\n]*:[ \t]*''', metadata):
            raise ValueError("Unsupported quoted Claude agent identity key; use name, \"name\", or 'name'")
        return None
    value = match[1].strip()
    if value.startswith('"'):
        # JSON quoted strings are a subset of YAML; raw_decode permits a trailing comment.
        name, tail = json.JSONDecoder().raw_decode(value)
        if not isinstance(name, str) or (tail.strip() and not tail.strip().startswith("#")):
            raise ValueError("Unsupported Claude agent name scalar")
        return name
    if value.startswith("'"):
        match = re.fullmatch(r"'((?:[^']|'')*)'[ \t]*(?:#.*)?", value)
        if not match:
            raise ValueError("Unsupported Claude agent name scalar")
        return match[1].replace("''", "'")
    name = re.split(r"[ \t]+#", value, maxsplit=1)[0].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise ValueError("Unsupported Claude agent name scalar; use a plain or quoted name")
    return name


def identity_collisions(root, policy, managed_files):
    errors = []
    for provider, extension, identities in (
        ("codex", ".toml", ["default", *policy["roles"]]),
        ("claude", ".md", ["general-purpose", *policy["roles"]]),
    ):
        folder = root / f".{provider}/agents"
        expected = {name: f".{provider}/agents/{name}{extension}" for name in identities}
        seen = {}
        if not folder.exists():
            continue
        for candidate in sorted(folder.rglob("*")):
            if candidate.is_symlink():
                raise ValueError(f"Symlink is not a native agent target: {candidate.relative_to(root)}")
            if not candidate.is_file() or candidate.suffix.lower() != extension:
                continue
            relative = candidate.relative_to(root).as_posix()
            path = safe_path(root, relative)
            name = (tomllib.loads(path.read_text()).get("name") if provider == "codex"
                    else claude_identity(path.read_text()))
            if not isinstance(name, str) or not name:
                continue
            if relative == expected.get(name) and relative in managed_files:
                continue
            if name in expected:
                errors.append(f"Native {provider} role identity collision: {name} in {relative}")
            elif name in seen:
                errors.append(f"Duplicate native {provider} role identity: {name} in {seen[name]} and {relative}")
            seen[name] = relative
    return errors


def build_files(root, package, policy, selections):
    files, generated = {}, set()

    def managed(relative, content):
        files[relative] = content
        generated.add(relative)

    for name, role in {"default": {**policy["default"], "description": "General implementation agent."}, **policy["roles"]}.items():
        managed(f".codex/agents/{name}.toml", role_toml(policy, selections, {**role, "name": name}))
        if name != "default":
            managed(f".claude/agents/{name}.md", role_markdown(policy, {**role, "name": name}))
    managed(".claude/agents/general-purpose.md", role_markdown(policy, {
        **policy["default"], "name": "general-purpose", "description": "General implementation agent."}))
    config_path = safe_path(root, ".codex/config.toml")
    config = tomllib.loads(config_path.read_text()) if config_path.exists() else {}
    config["model"] = policy["lead"]["codex"]
    config["model_reasoning_effort"] = policy["lead"]["effort"]
    agents = config.setdefault("agents", {})
    if not isinstance(agents, dict):
        raise ValueError("Codex agents must be a table")
    agents["default_subagent_model"] = policy["default"]["codex"]
    agents["default_subagent_reasoning_effort"] = policy["default"]["effort"]
    for name in ["default", *policy["roles"]]:
        existing = agents.get(name, {})
        if not isinstance(existing, dict):
            raise ValueError(f"Codex agents.{name} must be a table")
        agents[name] = {**existing, "description": "General implementation agent." if name == "default" else policy["roles"][name]["description"],
                        "config_file": f"agents/{name}.toml"}
    # Root settings are shared documents: preserve every unrelated semantic value.
    files[".codex/config.toml"] = dump_toml(config)
    settings_path = safe_path(root, ".claude/settings.json")
    settings = read_json(settings_path) if settings_path.exists() else {}
    if not isinstance(settings, dict):
        raise ValueError("Claude settings must be an object")
    settings.update(model=policy["lead"]["claude-code"], effortLevel=policy["lead"]["effort"])
    files[".claude/settings.json"] = json.dumps(settings, indent=2, ensure_ascii=False) + "\n"
    for name in ("AGENTS.md", "README.md"):
        path = safe_path(root, name)
        files[name] = linked_document(path.read_text() if path.exists() else f"# {root.name}\n", policy)
    path = safe_path(root, "CLAUDE.md")
    content = path.read_text() if path.exists() else ""
    files["CLAUDE.md"] = content if re.search(r"(?m)^@AGENTS\.md\s*$", content) else content.rstrip() + "\n\n@AGENTS.md\n"
    for source, target in (("testing-policy.md", "testing-policy.md"), ("engineering-guide.md", "README.md")):
        managed(f"docs/engineering/{target}", f"<!-- {MARKER} -->\n\n" + (package / "assets" / source).read_text())
    for name in ("engineering_profile.py", "check-engineering.py"):
        managed(f"scripts/{name}", (package / "scripts" / name).read_text())
    return files, generated


def install(root, package, apply=False, evidence=None, adopt_routing=False):
    profile_path = safe_path(root, PROFILE_PATH)
    previous = read_json(profile_path) if profile_path.exists() else {}
    if previous and previous.get("id") != "metamodern-engineering":
        raise ValueError(f"Unmanaged profile exists: {PROFILE_PATH}")
    if previous and previous.get("receipt_sha256") != digest(json.dumps({k: v for k, v in previous.items() if k != "receipt_sha256"}, sort_keys=True)):
        raise ValueError(f"User-modified profile receipt: {PROFILE_PATH}; nothing written")
    policy = read_json(package / "assets/engineering-profile.json")
    conflicts = routing_conflicts(root, policy, previous)
    if conflicts and not adopt_routing:
        raise ValueError("Preflight failed; nothing written. Review routing conflicts and use --adopt-routing to replace these fields only:\n" + "\n".join(conflicts))
    selections = selected_models(policy, previous, evidence)
    files, generated = build_files(root, package, policy, selections)
    errors = identity_collisions(root, policy, previous.get("managed_files", {}))
    config_path = safe_path(root, ".codex/config.toml")
    existing = tomllib.loads(config_path.read_text()) if config_path.exists() else {}
    if not previous:
        for name in ["default", *policy["roles"]]:
            if name in existing.get("agents", {}):
                errors.append(f"Unmanaged Codex role registration exists: {name}")
    for relative in sorted(generated):
        path = safe_path(root, relative)
        if path.exists():
            current = path.read_text()
            expected = previous.get("managed_files", {}).get(relative)
            if expected is None:
                errors.append(f"Unmanaged file exists: {relative}")
            elif digest(current) != expected:
                errors.append(f"User-modified managed file: {relative}")
    if errors:
        raise ValueError("Preflight failed; nothing written:\n" + "\n".join(errors))
    retained_evidence = evidence if evidence is not None else previous.get("availability_evidence")
    profile = {"schema_version": 1, "id": policy["id"], "policy": policy,
               "policy_sha256": digest(json.dumps(policy, sort_keys=True)),
               "selected_models": selections, "availability_evidence": retained_evidence,
               "availability": availability_result(policy, selections, retained_evidence),
               "managed_files": {name: digest(files[name]) for name in sorted(generated)}}
    profile["receipt_sha256"] = digest(json.dumps(profile, sort_keys=True))
    files[PROFILE_PATH] = json.dumps(profile, indent=2, ensure_ascii=False) + "\n"
    changed = [name for name, content in sorted(files.items())
               if not safe_path(root, name).exists() or safe_path(root, name).read_text() != content]
    # Preflight every target before creating directories or writing anything.
    for name in files:
        safe_path(root, name)
    if apply and any(record["status"] == "unsupported" for record in profile["availability"].values()):
        return {"action": "blocked", "changed_files": [], "planned_files": changed,
                "selected_models": selections, "availability": profile["availability"]}
    if apply:
        for name in changed:
            path = safe_path(root, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(files[name], encoding="utf-8")
    return {"action": "applied" if apply else "plan", "changed_files": changed,
            "adopted_routing": conflicts if adopt_routing else [],
            "selected_models": selections, "availability": profile["availability"]}


def check(root, evidence=None):
    errors = []
    profile = read_json(safe_path(root, PROFILE_PATH))
    policy, selections = profile["policy"], profile["selected_models"]
    errors.extend(identity_collisions(root, policy, profile.get("managed_files", {})))
    if profile.get("id") != "metamodern-engineering" or profile.get("schema_version") != 1:
        errors.append("Unsupported profile identity or schema")
    if profile.get("policy_sha256") != digest(json.dumps(policy, sort_keys=True)):
        errors.append("Installed profile policy drift")
    if profile.get("receipt_sha256") != digest(json.dumps({k: v for k, v in profile.items() if k != "receipt_sha256"}, sort_keys=True)):
        errors.append("Installed profile receipt drift")
    if selections.get("low_codex") not in policy["low_codex_candidates"]:
        errors.append("Low Codex model is outside policy")
    config = tomllib.loads(safe_path(root, ".codex/config.toml").read_text())
    for key, expected in (("model", policy["lead"]["codex"]), ("model_reasoning_effort", policy["lead"]["effort"])):
        if config.get(key) != expected:
            errors.append(f"Codex root {key} drift")
    for key, expected in (("default_subagent_model", policy["default"]["codex"]),
                          ("default_subagent_reasoning_effort", policy["default"]["effort"])):
        if config.get("agents", {}).get(key) != expected:
            errors.append(f"Codex agents {key} drift")
    for name, role in {"default": policy["default"], **policy["roles"]}.items():
        relative = f".codex/agents/{name}.toml"
        registration = config.get("agents", {}).get(name, {})
        if not isinstance(registration, dict) or registration.get("config_file") != f"agents/{name}.toml" or registration.get("description") != role.get("description", "General implementation agent."):
            errors.append(f"Codex role registration drift: {name}")
        try:
            native = tomllib.loads(safe_path(root, relative).read_text())
            expected = tomllib.loads(role_toml(policy, selections, {**role, "name": name, "description": role.get("description", "General implementation agent.")}))
            if any(native.get(key) != value for key, value in expected.items()):
                errors.append(f"Codex role configuration drift: {name}")
        except (OSError, ValueError) as exc:
            errors.append(f"Codex role {name}: {exc}")
        if name != "default":
            path = safe_path(root, f".claude/agents/{name}.md")
            if not path.exists() or path.read_text() != role_markdown(policy, {**role, "name": name}):
                errors.append(f"Claude role configuration drift: {name}")
    settings = read_json(safe_path(root, ".claude/settings.json"))
    if settings.get("model") != policy["lead"]["claude-code"] or settings.get("effortLevel") != policy["lead"]["effort"]:
        errors.append("Claude root model or effort drift")
    default_claude = safe_path(root, ".claude/agents/general-purpose.md")
    if not default_claude.exists() or default_claude.read_text() != role_markdown(policy, {
            **policy["default"], "name": "general-purpose", "description": "General implementation agent."}):
        errors.append("Claude general-purpose model or effort drift")
    for name in ("AGENTS.md", "README.md"):
        path = safe_path(root, name)
        if not path.exists() or "docs/engineering/testing-policy.md" not in path.read_text():
            errors.append(f"Missing testing-policy linkage: {name}")
        elif linked_document(path.read_text(), policy) != path.read_text():
            errors.append(f"Engineering instructions linkage drift: {name}")
    claude = safe_path(root, "CLAUDE.md")
    if not claude.exists() or not re.search(r"(?m)^@AGENTS\.md\s*$", claude.read_text()):
        errors.append("Missing CLAUDE.md import of AGENTS.md")
    for relative, expected in profile.get("managed_files", {}).items():
        path = safe_path(root, relative)
        if not path.exists() or digest(path.read_text()) != expected:
            errors.append(f"Managed file drift: {relative}")
    for relative in ("docs/engineering/testing-policy.md", "docs/engineering/README.md"):
        if not safe_path(root, relative).exists():
            errors.append(f"Missing engineering document: {relative}")
    availability = availability_result(policy, selections, evidence if evidence is not None else profile.get("availability_evidence"))
    return {"configuration": "passing" if not errors else "failing", "errors": errors,
            "availability": availability}


def main(mode):
    parser = argparse.ArgumentParser(description=f"{mode.title()} the shared Metamodern engineering profile")
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--availability", type=Path, help="Normalized provider model availability JSON")
    if mode == "configure":
        parser.add_argument("--apply", action="store_true", help="Apply the preflighted plan")
        parser.add_argument("--adopt-routing", action="store_true", help="Explicitly replace conflicting profile-owned model/effort fields only")
    args = parser.parse_args()
    try:
        root = args.project.resolve(strict=True)
        if not root.is_dir():
            raise ValueError("Project must be an existing directory")
        evidence = load_availability(args.availability)
        result = (install(root, Path(__file__).resolve().parent.parent, args.apply, evidence, args.adopt_routing)
                  if mode == "configure" else check(root, evidence))
        print(json.dumps(result, indent=2))
        if result.get("configuration") == "failing":
            return 1
        if any(x["status"] == "unsupported" for x in result["availability"].values()):
            return 2
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1
