import sys,re,zlib
sys.argv=[sys.argv[0]]+sys.argv[1:]
exec(open('bin/pdftext.py').read().split("tok=re.compile")[0].replace("b=open(sys.argv[1],'rb').read()","b=open(sys.argv[1],'rb').read()"))
def idx(d,o):
    n=int.from_bytes(d[o:o+2],'big')
    if n==0: return [],o+2
    osz=d[o+2]; offs=[int.from_bytes(d[o+3+i*osz:o+3+(i+1)*osz],'big') for i in range(n+1)]
    base=o+3+(n+1)*osz-1
    return [d[base+offs[i]:base+offs[i+1]] for i in range(n)],base+offs[-1]
def dictparse(bs):
    out={};ops=[];i=0
    while i<len(bs):
        b0=bs[i]
        if b0<=21:
            if b0==12: key=(12,bs[i+1]);i+=2
            else: key=b0;i+=1
            out[key]=ops;ops=[]
        elif b0==28: ops.append(int.from_bytes(bs[i+1:i+3],'big',signed=True));i+=3
        elif b0==29: ops.append(int.from_bytes(bs[i+1:i+5],'big',signed=True));i+=5
        elif b0==30:
            i+=1
            while True:
                x=bs[i];i+=1
                if (x&15)==15 or (x>>4)==15: break
            ops.append(0)
        elif 32<=b0<=246: ops.append(b0-139);i+=1
        elif 247<=b0<=250: ops.append((b0-247)*256+bs[i+1]+108);i+=2
        elif 251<=b0<=254: ops.append(-(b0-251)*256-bs[i+1]-108);i+=2
        else: i+=1
    return out
for num,(head,raw) in objs.items():
    if raw is None or b'/Type1C' not in head: continue
    d=data(num); hs=d[2]
    names,o=idx(d,hs); tops,o=idx(d,o); strs,o=idx(d,o)
    top=dictparse(tops[0]); cs=top.get(15,[0])[0]
    cso=top[17][0]; chs,_=idx(d,cso); ng=len(chs)
    sids=[0]
    if cs>2:
        fmt=d[cs];p=cs+1
        while len(sids)<ng:
            if fmt==0: sids.append(int.from_bytes(d[p:p+2],'big'));p+=2
            else:
                first=int.from_bytes(d[p:p+2],'big'); n=d[p+2] if fmt==1 else int.from_bytes(d[p+2:p+4],'big'); p+=3 if fmt==1 else 4
                sids+=list(range(first,first+n+1))
    def nm(s): return '#%d'%s if s<391 else strs[s-391].decode('latin1')
    print(num,names[0],[nm(s) for s in sids[:ng]])
