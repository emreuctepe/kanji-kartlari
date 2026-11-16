import sys,re,zlib
import os; CMAPDIR=os.path.dirname(os.path.dirname(os.path.abspath(sys.argv[0])))+'/cmap/'
def aj1():
    m={}
    t=open(CMAPDIR+'UniJIS-UTF32-H',encoding='latin1').read()
    for a,b,c in re.findall(r'<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(\d+)',t):
        a,b,c=int(a,16),int(b,16),int(c)
        for u in range(a,b+1):
            k=c+u-a
            if k not in m or 0x2E80<=ord(m[k])<=0x2FDF or 0xF900<=ord(m[k])<=0xFAFF: m[k]=chr(u) if not (k in m and (0x2E80<=u<=0x2FDF or 0xF900<=u<=0xFAFF)) else m[k]
    for a,c in re.findall(r'^<([0-9a-f]+)>\s*(\d+)\s*$',t,re.M):
        m.setdefault(int(c),chr(int(a,16)))
    return m
AJ1=None
b=open(sys.argv[1],'rb').read()
objs={}
for m in re.finditer(rb'(?<![0-9])(\d+) 0 obj',b):
    e=b.find(b'endobj',m.end())
    body=b[m.end():e]
    num=int(m.group(1))
    s=body.find(b'stream')
    if s>=0 and body[:s].count(b'<<')>0:
        head=body[:s]; st=s+6
        if body[st:st+2]==b'\r\n': st+=2
        elif body[st:st+1] in (b'\n',b'\r'): st+=1
        en=body.rfind(b'endstream')
        raw=body[st:en]
        objs[num]=(head,raw)
    else:
        objs[num]=(body,None)
def data(num):
    head,raw=objs[num]
    if raw is None: return None
    if b'FlateDecode' in head:
        try: return zlib.decompressobj().decompress(raw)
        except Exception: return b''
    return raw
for num,(head,raw) in list(objs.items()):
    if raw is not None and b'/ObjStm' in head:
        d=data(num); first=int(re.search(rb'/First (\d+)',head).group(1))
        nums=list(map(int,d[:first].split()))
        pairs=list(zip(nums[::2],nums[1::2]))
        for i,(on,off) in enumerate(pairs):
            end=pairs[i+1][1] if i+1<len(pairs) else len(d)-first
            if on not in objs: objs[on]=(d[first+off:first+end],None)
def dictof(num): return objs[num][0]
def ref(s,key):
    m=re.search(rb'/'+key+rb'\s*(\d+) 0 R',s); return int(m.group(1)) if m else None
def subdict(s,key):
    i=s.find(b'/'+key)
    if i<0: return None
    j=i+len(key)+1
    while s[j:j+1] in b' \r\n': j+=1
    if s[j:j+2]!=b'<<':
        m=re.match(rb'(\d+) 0 R',s[j:]); return dictof(int(m.group(1))) if m else None
    depth=0;k=j
    while k<len(s):
        if s[k:k+2]==b'<<': depth+=1;k+=2;continue
        if s[k:k+2]==b'>>':
            depth-=1;k+=2
            if depth==0: return s[j:k]
            continue
        k+=1
    return s[j:]
def tounicode(num):
    d=data(num).decode('latin1'); m={}
    for blk in re.findall(r'beginbfchar(.*?)endbfchar',d,re.S):
        for a,u in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>',blk):
            m[int(a,16)]=bytes.fromhex(u).decode('utf-16-be','replace')
    for blk in re.findall(r'beginbfrange(.*?)endbfrange',d,re.S):
        for a,c,u in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>',blk):
            a,c=int(a,16),int(c,16); base=bytes.fromhex(u).decode('utf-16-be','replace')
            for i in range(a,c+1): m[i]=base[:-1]+chr(ord(base[-1])+i-a)
    return m
fontcache={}
def font(num):
    global AJ1
    if num in fontcache: return fontcache[num]
    s=dictof(num); tu=ref(s,b'ToUnicode')
    cid=b'Type0' in s
    f={'cid':cid,'map':tounicode(tu) if tu else None,'edif':(b'EdiF' in s) and os.environ.get('EDIF') and num}
    if cid and not f['map']:
        if AJ1 is None: AJ1=aj1()
        f['map']=AJ1
    fontcache[num]=f; return f
def decode(f,bs):
    if f['cid']:
        out=''
        for i in range(0,len(bs)-1,2):
            c=bs[i]*256+bs[i+1]; out+=f['map'].get(c,'�') if f['map'] else '?'
        return out
    if f.get('edif'): return ''.join('⟦%d:%d⟧'%(f['edif'],x) for x in bs)
    if f['map']: return ''.join(f['map'].get(x,chr(x)) for x in bs)
    return bs.decode('latin1')
tok=re.compile(rb'(\((?:\\.|[^\\)])*\))|(<[0-9A-Fa-f\s]*>)|(\[)|(\])|(/[^\s/\[\]()<>]+)|([-+]?\d*\.?\d+)|([A-Za-z\'"*]+\d?\*?)|(<<|>>)')
def pstr(t):
    if t.startswith(b'('):
        s=t[1:-1]; out=bytearray(); i=0
        while i<len(s):
            if s[i]==92:
                i+=1; c=s[i:i+1]
                if c in b'01234567':
                    m=re.match(rb'[0-7]{1,3}',s[i:]); out.append(int(m.group(),8)&255); i+=len(m.group()); continue
                out+= {b'n':b'\n',b'r':b'\r',b't':b'\t',b'b':b'\b',b'f':b'\f'}.get(c,c); i+=1
            else: out.append(s[i]); i+=1
        return bytes(out)
    h=re.sub(rb'\s',b'',t[1:-1]); 
    if len(h)%2: h+=b'0'
    return bytes.fromhex(h.decode())
def mul(a,b2): return [a[0]*b2[0]+a[1]*b2[2],a[0]*b2[1]+a[1]*b2[3],a[2]*b2[0]+a[3]*b2[2],a[2]*b2[1]+a[3]*b2[3],a[4]*b2[0]+a[5]*b2[2]+b2[4],a[4]*b2[1]+a[5]*b2[3]+b2[5]]
def run(content,res,ctm,out):
    fonts=subdict(res,b'Font') or b''
    xo=subdict(res,b'XObject') or b''
    st=[];stack=[];arr=None;tm=[1,0,0,1,0,0];tlm=tm[:];fs=1;fn=None;lead=0;cur=ctm[:]
    for m in tok.finditer(content):
        t=m.group(0)
        if m.group(3): arr=[];continue
        if m.group(4): stack.append(arr);arr=None;continue
        if m.group(7) and not t.startswith(b'/'):
            op=t
            if arr is not None: continue
            if op==b'q': st.append(cur[:])
            elif op==b'Q': cur=st.pop() if st else cur
            elif op==b'cm': cur=mul([float(x) for x in stack[-6:]],cur)
            elif op==b'BT': tm=[1,0,0,1,0,0];tlm=tm[:]
            elif op==b'Tf':
                fnum=ref(fonts,stack[-2][1:]); fn=font(fnum) if fnum else None; fs=float(stack[-1])
            elif op==b'Tm': tm=[float(x) for x in stack[-6:]];tlm=tm[:]
            elif op in (b'Td',b'TD'):
                tx,ty=float(stack[-2]),float(stack[-1]); tlm=mul([1,0,0,1,tx,ty],tlm);tm=tlm[:]
                if op==b'TD': lead=-ty
            elif op==b'TL': lead=float(stack[-1])
            elif op==b'T*': tlm=mul([1,0,0,1,0,-lead],tlm);tm=tlm[:]
            elif op in (b'Tj',b"'",b'"',b'TJ'):
                if op in (b"'",b'"'): tlm=mul([1,0,0,1,0,-lead],tlm);tm=tlm[:]
                items=stack[-1] if op==b'TJ' else [stack[-1]]
                if not isinstance(items,list): items=[items]
                txt=''
                for it in items:
                    if isinstance(it,bytes) and (it.startswith(b'(') or it.startswith(b'<')):
                        txt+=decode(fn,pstr(it)) if fn else '?'
                    elif isinstance(it,bytes):
                        try:
                            if float(it)<-400: txt+=' '
                        except: pass
                M=mul(tm,cur); size=fs*(M[0]**2+M[1]**2)**.5
                out.append((M[4],M[5],size,txt,M[1]!=0 or M[0]<0))
            elif op==b'Do':
                xn=ref(xo,stack[-1][1:])
                if xn and b'/Form' in objs[xn][0]:
                    h=objs[xn][0]; mm=re.search(rb'/Matrix\s*\[([^\]]*)\]',h)
                    fm=[float(x) for x in mm.group(1).split()] if mm else [1,0,0,1,0,0]
                    r2=subdict(h,b'Resources') or res
                    run(data(xn),r2,mul(fm,cur),out)
            stack=[]
        else:
            if arr is not None: arr.append(t)
            else: stack.append(t)
pages=[n for n,(h,r) in objs.items() if re.search(rb'/Type\s*/Page(?!s)',h)]
# order pages via Pages tree
def kids(n):
    h=objs[n][0]
    if re.search(rb'/Type\s*/Pages',h):
        ks=re.search(rb'/Kids\s*\[([^\]]*)\]',h).group(1)
        r=[]
        for k in re.findall(rb'(\d+) 0 R',ks): r+=kids(int(k))
        return r
    return [n]
root=[n for n,(h,r) in objs.items() if re.search(rb'/Type\s*/Pages',h) and b'/Parent' not in h]
order=kids(root[0]) if root else sorted(pages)
minsize=float(sys.argv[2]) if len(sys.argv)>2 else 6
for pi,pn in enumerate(order,1):
    h=objs[pn][0]
    res=subdict(h,b'Resources') or b''
    cs=re.search(rb'/Contents\s*(\[[^\]]*\]|\d+ 0 R)',h)
    content=b''
    if cs:
        refs=[int(c) for c in re.findall(rb'(\d+) 0 R',cs.group(1))]
        if len(refs)==1 and objs[refs[0]][1] is None: refs=[int(c) for c in re.findall(rb'(\d+) 0 R',objs[refs[0]][0])]
        for c in refs: content+=(data(c) or b'')+b'\n'
    out=[]; run(content,res,[1,0,0,1,0,0],out)
    print('=== sayfa %d ==='%pi)
    import collections
    if os.environ.get('SIZES'): print(collections.Counter(round(o[2],1) for o in out))
    out=[o for o in out if o[2]>=minsize and o[3].strip()]
    out.sort(key=lambda o:-o[1])
    lines=[];cy=None
    for x,y,s,t,rot in out:
        if cy is None or abs(y-cy)>3: lines.append([]);cy=y
        lines[-1].append((x,t))
    import unicodedata
    for l in lines: print(''.join(unicodedata.normalize('NFKC',c) if 0x2E80<=ord(c)<=0x2FDF else c for c in ''.join(t for x,t in sorted(l))))
