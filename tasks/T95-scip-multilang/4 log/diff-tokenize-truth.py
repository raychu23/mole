import sys, tokenize, io, json, glob, random, ast


def owners(src):
    toks = list(tokenize.generate_tokens(io.StringIO(src).readline))
    lines = src.split('\n'); n = len(lines); owner = list(range(n)); start = None
    for t in toks:
        if t.type in (tokenize.COMMENT, tokenize.NL, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING):
            continue
        if start is None:
            start = t.start[0] - 1
        if t.type in (tokenize.NEWLINE, tokenize.ENDMARKER):
            for l in range(start, min(t.end[0], n)):
                owner[l] = start
            start = None
    return lines, owner


mode = sys.argv[1]; out = []
if mode == 'corpus':
    files = glob.glob('/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/**/*.py', recursive=True) \
        + glob.glob('/Users/a1/.hermes/cache/scratch/mole-ab-venv/lib/python3*/site-packages/**/*.py', recursive=True)
    for f in files:
        try:
            src = open(f, encoding='utf-8').read(); lines, o = owners(src)
        except Exception:
            continue
        out.append({'f': f, 'lines': lines, 'owner': o})
else:
    random.seed(int(sys.argv[3]))
    atoms = open(sys.argv[0].replace('truth.py', 'atoms.txt')).read().split('\n@@\n')
    stmts = ['from . import m{n}', 'from .. import (a{n},\n  b{n})', 'from .p{n} import \\\n  c{n}', 'x{n} = {a}',
             'x{n} = ({a}, {a})', '# comment ( [ {{ \\', 'def f{n}(v=({a})):\n    return {a}', 'y{n} = {a}  # tail (']
    tries = 0
    while len(out) < int(sys.argv[2]) and tries < 100000:
        tries += 1
        src = '\n'.join(random.choice(stmts).replace('{a}', random.choice(atoms)).replace('{n}', str(i)).replace('{{', '{')
                        for i in range(random.randint(3, 9))) + '\n'
        try:
            ast.parse(src); lines, o = owners(src)
        except Exception:
            continue
        out.append({'f': 'fuzz%d' % len(out), 'lines': lines, 'owner': o, 'src': src})
    print('kept', len(out), 'of', tries, file=sys.stderr)
json.dump(out, open(sys.argv[-1], 'w'))
