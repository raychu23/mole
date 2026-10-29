#!/usr/bin/env python3
"""M24 key helper (T32): the owners GitHub would request for a pull request, computed independently of Mole's TypeScript.

Follows GitHub's documented CODEOWNERS rules
(docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners):
  * the file is read from the PR's BASE branch: .github/CODEOWNERS, then CODEOWNERS, then docs/CODEOWNERS (first found wins)
  * gitignore-style patterns, except: no `!` negation, no `[ ]` ranges, no `\\#` escape; `#` starts a comment
  * the LAST matching line wins; a matching line with no owners leaves the file unowned
  * owners are @user, @org/team or an email address
The PR's owners = the union over every changed path (old and new side, renames split), sorted.

usage: m24_owners.py REPO BASE HEAD   -> JSON list of owners on stdout
"""
import json
import re
import subprocess
import sys

LOCATIONS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']


def git(repo, *args):
    return subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True, check=True).stdout


def read_codeowners(repo, rev):
    for loc in LOCATIONS:
        r = subprocess.run(['git', '-C', repo, 'show', f'{rev}:{loc}'], capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
    return ''


def is_owner(tok):
    return tok.startswith('@') or re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', tok) is not None


def parse(text):
    rules = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        toks = line.split()
        pat, owners = toks[0], []
        for t in toks[1:]:
            if t.startswith('#'):
                break
            t = t.rstrip(',')
            if is_owner(t):
                owners.append(t)
        rules.append((pat, owners))
    return rules


def glob_to_regex(pat):
    """one gitignore glob (no leading slash) -> regex over a '/'-joined path"""
    out, i = '', 0
    while i < len(pat):
        if pat.startswith('**/', i):
            out += '(?:[^/]+/)*'
            i += 3
        elif pat.startswith('/**', i) and i + 3 == len(pat):
            out += '/.+'
            i += 3
        elif pat.startswith('**', i):
            out += '.*'
            i += 2
        elif pat[i] == '*':
            out += '[^/]*'
            i += 1
        elif pat[i] == '?':
            out += '[^/]'
            i += 1
        else:
            out += re.escape(pat[i])
            i += 1
    return out


def matches(pat, path):
    dir_only = pat.endswith('/')
    p = pat.rstrip('/')
    if p == '':
        return False
    anchored = p.startswith('/') or '/' in p
    p = p.lstrip('/')
    rx = re.compile(glob_to_regex(p))
    parts = path.split('/')
    # GitHub: `docs/*` matches docs/a.md but not docs/sub/b.md, so a wildcard in the LAST segment never covers a folder's
    # contents; a literal last segment (`apps/`, `/apps/github`, `**/logs`) covers everything under the folder it names
    last = p.split('/')[-1]
    wild_last = '*' in last or '?' in last
    # a pattern matches the path itself or any directory containing it (gitignore: an ignored dir covers its contents)
    for k in range(1, len(parts) + 1):
        is_dir = k < len(parts)
        if dir_only and not is_dir:
            continue
        if is_dir and wild_last and not p.endswith('**'):
            continue
        if anchored:
            if rx.fullmatch('/'.join(parts[:k])):
                return True
        elif rx.fullmatch(parts[k - 1]):
            return True
    return False


def owners_of(rules, path):
    found = []
    for pat, owners in rules:
        if matches(pat, path):
            found = owners
    return found


def changed_paths(repo, base, head):
    mb = git(repo, 'merge-base', base, head).strip()
    out = git(repo, 'diff', '--name-only', '--no-renames', '-z', mb, head)
    return mb, [p for p in out.split('\0') if p]


def pr_owners(repo, base, head):
    mb, paths = changed_paths(repo, base, head)
    rules = parse(read_codeowners(repo, mb))
    owners = set()
    for p in paths:
        owners.update(owners_of(rules, p))
    return sorted(owners)


if __name__ == '__main__':
    repo, base, head = sys.argv[1:4]
    print(json.dumps(pr_owners(repo, base, head)))
