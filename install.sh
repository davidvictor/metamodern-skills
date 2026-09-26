#!/usr/bin/env bash
set -euo pipefail

requested_skills=()
requested_skill_keys="|"
has_requested_skills=false

usage() {
  cat <<'EOF'
Usage: bash install.sh [--skill metamodern-<verb>-<object>]...

Without --skill, install or update the complete Metamodern collection.
Repeat --skill to install or update only named canonical packages.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill)
      if [[ $# -lt 2 || ! "$2" =~ ^metamodern-[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        echo "--skill requires a canonical Metamodern skill name." >&2
        exit 1
      fi
      if [[ "$requested_skill_keys" == *"|$2|"* ]]; then
        echo "Duplicate --skill selection: $2" >&2
        exit 1
      fi
      requested_skills+=("$2")
      requested_skill_keys+="$2|"
      has_requested_skills=true
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown installer option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

source_root="${METAMODERN_SKILLS_SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)}"
installer_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
collection_validator="${installer_root}/scripts/validate-skill-collection.mjs"
package_validator="${installer_root}/scripts/validate-skill-package.mjs"
install_home="${METAMODERN_INSTALL_HOME:-${HOME}}"
shared_root="${install_home}/.agents/skills"
legacy_root="${install_home}/.codex/skills"
claude_root="${install_home}/.claude/skills"
retire_date="${METAMODERN_RETIRE_DATE:-$(date +%F)}"
if [[ ! "$retire_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Invalid retirement date; expected YYYY-MM-DD: ${retire_date}" >&2
  exit 1
fi
if [[ -L "$source_root" ]]; then
  echo "Refusing a symlinked Metamodern skill source root: ${source_root}" >&2
  exit 1
fi
if [[ ! -f "$collection_validator" ]]; then
  echo "Metamodern skill collection validator is unavailable: ${collection_validator}" >&2
  exit 1
fi
if [[ ! -f "$package_validator" ]]; then
  echo "Metamodern skill package validator is unavailable: ${package_validator}" >&2
  exit 1
fi
if ! node "$collection_validator" "$source_root"; then
  echo "Refusing an invalid Metamodern skill collection: ${source_root}" >&2
  exit 1
fi
legacy_pairs=(
  "metamodern-shape-prompt|metamodern-articulate-intent"
  "metamodern-shape-prompt|metamodern-expand-intent"
  "metamodern-shape-prompt|articulate-intent"
  "metamodern-develop-brand|metamodern-brand-builder-skill"
  "metamodern-explore-brand-expression|metamodern-develop-visual-direction"
  "metamodern-explore-brand-expression|visual-direction"
  "metamodern-prepare-proposal|writing-metamodern-proposals"
  "metamodern-process-meeting|process-a-meeting"
  "metamodern-work-in-figma|figma-working-style-skill"
)

run_skills() {
  if [[ -n "${METAMODERN_SKILLS_RUNNER:-}" ]]; then
    "${METAMODERN_SKILLS_RUNNER}" "$@"
  else
    npx --yes skills@1.5.22 "$@"
  fi
}

same_path() {
  [[ "$(cd "$1" && pwd -P)" == "$(cd "$2" && pwd -P)" ]]
}

shopt -s nullglob
packages=("${source_root}"/metamodern-*)
shopt -u nullglob

if [[ ${#packages[@]} -eq 0 ]]; then
  echo "No Metamodern skill packages found in ${source_root}." >&2
  exit 1
fi

if [[ "$has_requested_skills" == true ]]; then
  selected_packages=()
  for requested in "${requested_skills[@]}"; do
    found=""
    for package_dir in "${packages[@]}"; do
      if [[ "$(basename "$package_dir")" == "$requested" ]]; then
        found="$package_dir"
        break
      fi
    done
    if [[ -z "$found" ]]; then
      echo "Unknown Metamodern skill: ${requested}" >&2
      exit 1
    fi
    selected_packages+=("$found")
  done
  packages=("${selected_packages[@]}")
fi

if ! node "$package_validator" "${packages[@]}"; then
  echo "Refusing invalid Metamodern skill packages." >&2
  exit 1
fi

package_selected() {
  local candidate="$1"
  local package_dir
  for package_dir in "${packages[@]}"; do
    [[ "$(basename "$package_dir")" == "$candidate" ]] && return 0
  done
  return 1
}

for package_dir in "${packages[@]}"; do
  if [[ -L "$package_dir" ]]; then
    echo "Refusing a symlinked canonical package: ${package_dir}" >&2
    exit 1
  fi
  [[ -d "$package_dir" ]] || continue
  name="$(basename "$package_dir")"
  expected_marker="${name}:metamodern-agency"
  marker_path="${package_dir}/PACKAGE_ID"
  version_path="${package_dir}/PACKAGE_VERSION"
  skill_path="${package_dir}/SKILL.md"
  shared_path="${shared_root}/${name}"
  legacy_path="${legacy_root}/${name}"
  claude_path="${claude_root}/${name}"

  if [[ ! -f "$skill_path" || ! -f "$marker_path" || "$(<"$marker_path")" != "$expected_marker" ]]; then
    echo "Refusing invalid canonical package identity: ${package_dir}" >&2
    exit 1
  fi
  if [[ ! -f "$version_path" || ! "$(<"$version_path")" =~ ^${name}@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    echo "Refusing invalid canonical package version: ${package_dir}" >&2
    exit 1
  fi
  if ! grep -Fxq "name: ${name}" "$skill_path"; then
    echo "Refusing package whose skill name differs from its directory: ${package_dir}" >&2
    exit 1
  fi
  if [[ -L "$shared_path" ]]; then
    echo "Refusing unexpected user-level skill symlink: ${shared_path}" >&2
    exit 1
  fi
  if [[ -e "$shared_path" ]]; then
    if [[ ! -d "$shared_path" ]]; then
      echo "Refusing unrelated skill path: ${shared_path}" >&2
      exit 1
    fi
    if [[ -f "$shared_path/PACKAGE_ID" ]]; then
      if [[ "$(<"$shared_path/PACKAGE_ID")" != "$expected_marker" ]]; then
        echo "Refusing unrelated skill path: ${shared_path}" >&2
        exit 1
      fi
    elif ! diff -qr --exclude PACKAGE_ID "$package_dir" "$shared_path" >/dev/null; then
      echo "Refusing unrelated skill path: ${shared_path}" >&2
      exit 1
    fi
  fi
  if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
    echo "Refusing legacy Codex skill path: ${legacy_path}" >&2
    exit 1
  fi
  if [[ -e "$claude_path" || -L "$claude_path" ]]; then
    if [[ ! -L "$claude_path" || ! -d "$shared_path" ]] || ! same_path "$claude_path" "$shared_path"; then
      echo "Refusing unrelated Claude skill path: ${claude_path}" >&2
      exit 1
    fi
  fi
done

for pair in "${legacy_pairs[@]}"; do
  canonical_name="${pair%%|*}"
  legacy_name="${pair#*|}"
  package_selected "$canonical_name" || continue
  legacy_shared="${shared_root}/${legacy_name}"
  legacy_codex="${legacy_root}/${legacy_name}"
  legacy_claude="${claude_root}/${legacy_name}"
  retired_shared="${install_home}/.agents/retired-skills/${retire_date}/${legacy_name}"
  retired_claude="${install_home}/.claude/retired-skills/${retire_date}/${legacy_name}"

  if [[ -e "$legacy_codex" || -L "$legacy_codex" ]]; then
    echo "Refusing legacy Codex skill path: ${legacy_codex}" >&2
    exit 1
  fi
  if [[ ! -e "$legacy_shared" && ! -L "$legacy_shared" ]]; then
    if [[ -e "$legacy_claude" || -L "$legacy_claude" ]]; then
      echo "Refusing orphan legacy Claude skill path: ${legacy_claude}" >&2
      exit 1
    fi
    continue
  fi
  if [[ -L "$legacy_shared" || ! -d "$legacy_shared" || ! -f "$legacy_shared/SKILL.md" || ! -f "$legacy_shared/PACKAGE_ID" ]]; then
    echo "Refusing unrelated legacy skill path: ${legacy_shared}" >&2
    exit 1
  fi
  if ! grep -Fxq "name: ${legacy_name}" "$legacy_shared/SKILL.md" || [[ "$(<"$legacy_shared/PACKAGE_ID")" != "${legacy_name}:metamodern-agency" ]]; then
    echo "Refusing unrelated legacy skill path: ${legacy_shared}" >&2
    exit 1
  fi
  if [[ -e "$retired_shared" || -L "$retired_shared" || -e "$retired_claude" || -L "$retired_claude" ]]; then
    echo "Refusing occupied retired skill path for ${legacy_name}." >&2
    exit 1
  fi
  if [[ -e "$legacy_claude" || -L "$legacy_claude" ]]; then
    if [[ ! -L "$legacy_claude" ]] || ! same_path "$legacy_claude" "$legacy_shared"; then
      echo "Refusing unrelated legacy Claude skill path: ${legacy_claude}" >&2
      exit 1
    fi
  fi
done

for package_dir in "${packages[@]}"; do
  [[ -d "$package_dir" ]] || continue
  name="$(basename "$package_dir")"
  expected_marker="${name}:metamodern-agency"
  shared_path="${shared_root}/${name}"
  claude_path="${claude_root}/${name}"

  run_skills add "$package_dir" --global --agent codex --agent claude-code --skill "$name" --yes

  if [[ ! -d "$shared_path" || -L "$shared_path" || ! -f "$shared_path/PACKAGE_ID" || "$(<"$shared_path/PACKAGE_ID")" != "$expected_marker" ]]; then
    echo "Installed user-level skill failed identity verification: ${shared_path}" >&2
    exit 1
  fi
  if [[ ! -L "$claude_path" ]] || ! same_path "$claude_path" "$shared_path"; then
    echo "Claude skill failed shared-link verification: ${claude_path}" >&2
    exit 1
  fi
  diff -qr "$package_dir" "$shared_path" >/dev/null
  echo "Installed ${name} from its canonical Metamodern package."
done

for pair in "${legacy_pairs[@]}"; do
  canonical_name="${pair%%|*}"
  legacy_name="${pair#*|}"
  package_selected "$canonical_name" || continue
  legacy_shared="${shared_root}/${legacy_name}"
  legacy_claude="${claude_root}/${legacy_name}"
  [[ -d "$legacy_shared" && ! -L "$legacy_shared" ]] || continue
  retired_shared="${install_home}/.agents/retired-skills/${retire_date}/${legacy_name}"
  mkdir -p "$(dirname "$retired_shared")"
  mv "$legacy_shared" "$retired_shared"
  if [[ -L "$legacy_claude" ]]; then rm "$legacy_claude"; fi
  echo "Retired superseded skill name ${legacy_name}."
done
