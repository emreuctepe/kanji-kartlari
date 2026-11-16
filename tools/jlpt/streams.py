import sys,re,zlib
b=open(sys.argv[1],'rb').read()
for m in re.finditer(rb'(\d+) 0 obj',b):
    s=b.find(b'stream',m.end())
    if s<0: continue
    head=b[m.end():s]
    if b'endobj' in head: continue
    st=s+6+(2 if b[s+6:s+8]==b'\r\n' else 1)
    e=b.find(b'endstream',st); raw=b[st:e]
    try: dec=zlib.decompress(raw) if b'Flate' in head else raw
    except Exception as ex: dec=b'ERR'
    print(m.group(1).decode(), len(raw), len(dec), head[:150].replace(b'\r',b' ').replace(b'\n',b' '), dec[:80] if b'Image' not in head else b'')
