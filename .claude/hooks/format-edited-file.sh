#!/bin/sh
# PostToolUse hook (Edit|Write): format only the file Claude just edited, with the
# project's own Prettier and its own config (.prettierrc.json, .prettierignore,
# .gitignore). It never fails the edit: every path below exits 0.
# Safety net: run `npx prettier --check .` before committing.

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" 2>/dev/null || exit 0

# The edited path, from the hook's JSON input on stdin (tool_input.file_path).
file=$(node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { process.stdout.write(JSON.parse(s).tool_input?.file_path ?? ""); } catch {}
  });
') || exit 0
[ -n "$file" ] || exit 0
case "$file" in /*) ;; *) file="$root/$file" ;; esac

# Only existing files inside this project, never node_modules.
[ -f "$file" ] || exit 0
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
case "$file" in */node_modules/*) exit 0 ;; esac

# Ask Prettier itself whether it covers the file: ignored (via .prettierignore or
# .gitignore, e.g. output/) or no parser for the type (e.g. .txt) means skip.
# --no-install: use the project's Prettier, never download one.
info=$(npx --no-install prettier --file-info "$file" 2>/dev/null) || exit 0
covered=$(printf '%s' "$info" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { const i = JSON.parse(s); process.stdout.write(!i.ignored && i.inferredParser ? "yes" : "no"); }
    catch { process.stdout.write("no"); }
  });
') || exit 0
[ "$covered" = "yes" ] || exit 0

npx --no-install prettier --write --log-level warn "$file" >/dev/null 2>&1
exit 0
