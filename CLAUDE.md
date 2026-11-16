# Website notes for Claude

Static site for zhangdz.ca (GitHub Pages, served from `main`). `v1/` is an old archived version: don't update it.

## Keep things in sync
When changing something, check every other place it appears and update those too:
- **Command order:** the top nav (`#shortcuts`) and the "More:" line under whoami should list commands in the same order.
- **Experience & projects:** don't repeat the same achievement in both; details belong in one place.
- **Resume facts** (dates, titles): match `Daniel_Zhang_Resume.pdf`.
- **Cache busting:** when editing any css/js file, bump its `?v=` in `index.html` (format `YYYYMMDD-N`), or browsers keep the old file.
- **New pages:** add them to `sitemap.xml`.

`scripts/check-consistency.py` checks command order (nav, whoami links and the help list) and `?v=` bumps automatically and runs as a hook after every edit. When you spot a new kind of inconsistency, add a check there and a line here.

## Commits
Author all commits as danielzhang122 <98472640+danielzhang122@users.noreply.github.com>. No Claude attribution or co-author lines.
