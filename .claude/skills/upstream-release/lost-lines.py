"""Lists fork-added lines that the working tree no longer holds verbatim, per file.

Usage, from the repo root during a merge: python3 -I .claude/skills/upstream-release/lost-lines.py <OLD tag>
A line you merged on purpose with upstream's version shows here too; every other line is a fork change the merge lost.
"""
import subprocess
import sys


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


old = sys.argv[1]
skip = ("ios-personal/", "docs/", ".claude/")
for path in git("diff", "--name-only", old, "main").split():
    if path.startswith(skip):
        continue
    added = [line[1:].strip() for line in git("diff", "-U0", old, "main", "--", path).splitlines()
             if line.startswith("+") and not line.startswith("+++")]
    added = [line for line in added if len(line) >= 8]
    try:
        with open(path, encoding="utf-8") as handle:
            present = {line.strip() for line in handle}
    except FileNotFoundError:
        if added:
            print(f"GONE {path}: {len(added)} fork lines")
        continue
    missing = [line for line in added if line not in present]
    if missing:
        print(f"== {path}: {len(missing)} fork line(s) not verbatim")
        for line in missing[:6]:
            print("   ", line[:170])
