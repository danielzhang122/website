#!/bin/bash
# Commit as Daniel, never as Claude: commits by Claude would add Claude to the repo's contributors list.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

git config user.name "danielzhang122"
git config user.email "98472640+danielzhang122@users.noreply.github.com"

# A commit-msg hook that drops Claude attribution lines (Co-Authored-By: Claude, Claude-Session,
# "Generated with Claude Code") from every commit message, whoever writes it.
hook="$(git rev-parse --git-path hooks)/commit-msg"
mkdir -p "$(dirname "$hook")"
cat > "$hook" <<'HOOK'
#!/bin/sh
# Installed by .claude/hooks/session-start.sh: strips Claude attribution from commit messages.
msg="$1"
tmp="$msg.tmp"
grep -viE '^(co-authored-by:.*(claude|anthropic)|claude-session:|.*generated with \[?claude code)' "$msg" > "$tmp" || true
# Drop the blank lines the removed trailers leave at the end.
awk '{ lines[NR] = $0 } END { n = NR; while (n > 0 && lines[n] ~ /^[[:space:]]*$/) n--; for (i = 1; i <= n; i++) print lines[i] }' "$tmp" > "$msg"
rm -f "$tmp"
HOOK
chmod +x "$hook"
