#!/usr/bin/env python3
"""Consistency checks for index.html. Exit 2 with a message on stderr if something is off.

1. Command link order: every group of data-run buttons (the top nav, the
   "More:" line under whoami, etc.) must list shared commands in the same order.
2. Cache busting: a css/js file with uncommitted changes needs its ?v= bumped in index.html,
   or browsers keep the old copy.
"""
import re, sys, itertools, pathlib, subprocess

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
problems = []

# Group data-run buttons by their containing <nav> or <p> element.
groups = []
for m in re.finditer(r'<(nav|p)\b[^>]*>(.*?)</\1>', html, re.S):
    runs = re.findall(r'data-run="([^"]+)"', m.group(2))
    if len(runs) >= 2:
        line = html.count("\n", 0, m.start()) + 1
        groups.append((line, runs))

for (la, a), (lb, b) in itertools.combinations(groups, 2):
    shared = [x for x in a if x in b]
    if len(shared) >= 2 and shared != [x for x in b if x in a]:
        problems.append(
            f"Command order mismatch: line {la} has {shared}, "
            f"line {lb} has {[x for x in b if x in a]}. Make them match."
        )

def git(*args):
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True).stdout

head_html = git("show", "HEAD:index.html")
for path, ver in re.findall(r'(?:href|src)="((?:css|js)/[^"?]+)\?v=([^"]+)"', html):
    if git("status", "--porcelain", "--", path).strip() and f"{path}?v={ver}" in head_html:
        problems.append(f"{path} changed but its ?v={ver} in index.html wasn't bumped. Bump it so browsers refetch.")

if problems:
    print("index.html consistency check failed:\n- " + "\n- ".join(problems), file=sys.stderr)
    sys.exit(2)
