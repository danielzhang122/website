# Notes for Claude sessions in this repo

## Commit identity

Commit as Daniel, never as Claude. Before your first commit, run:

```sh
git config user.name "danielzhang122"
git config user.email "98472640+danielzhang122@users.noreply.github.com"
```

Check with `git log -1 --format='%an <%ae>'` before pushing. Commits by `Claude <noreply@anthropic.com>`
add Claude to this repo's contributors list, which Daniel doesn't want. Don't add `Co-Authored-By`
lines or "Generated with Claude Code" footers to commits or PR descriptions either; if a tool adds
a footer to a PR, edit the PR to remove it.
