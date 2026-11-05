
import sys, tokenize, io, json, random, glob
files=sorted(glob.glob('/Users/a1/.hermes/cache/scratch/mole-ab-venv/lib/python3*/site-packages/**/*.py', recursive=True))
random.seed(7); files=random.sample(files, 1000)
out=[]
for f in files:
    try: src=open(f,encoding='utf-8').read(); toks=list(tokenize.generate_tokens(io.StringIO(src).readline))
    except Exception: continue
    lines=src.split('\n'); n=len(lines); owner=list(range(n))
    # statement start for every physical line: lines covered by one logical line map to its first line
    start=None
    for t in toks:
        if t.type in (tokenize.COMMENT, tokenize.NL, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING): 
            if t.type==tokenize.NL and start is None: pass
            continue
        if start is None: start=t.start[0]-1
        if t.type==tokenize.NEWLINE or t.type==tokenize.ENDMARKER:
            for l in range(start, min(t.end[0], n)): owner[l]=start
            start=None
    out.append({'f':f,'lines':lines,'owner':owner})
json.dump(out, open(sys.argv[1],'w'))
