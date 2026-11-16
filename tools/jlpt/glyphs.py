import sys,re,zlib,hashlib,json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'pdftext.py')).read().split("tok=re.compile")[0])
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'cffnames.py')).read().split("for num,(head,raw)")[0].split("exec(")[0]+open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'cffnames.py')).read().split("exec(open('bin/pdftext.py').read().split(\"tok=re.compile\")[0].replace(\"b=open(sys.argv[1],'rb').read()\",\"b=open(sys.argv[1],'rb').read()\"))")[1].split("for num,(head,raw)")[0])
def num_ops(cs,i):
    b0=cs[i]
    if b0==28: return int.from_bytes(cs[i+1:i+3],'big',signed=True),3
    if 32<=b0<=246: return b0-139,1
    if 247<=b0<=250: return (b0-247)*256+cs[i+1]+108,2
    if 251<=b0<=254: return -(b0-251)*256-cs[i+1]-108,2
    if b0==255: return int.from_bytes(cs[i+1:i+5],'big',signed=True)/65536,5
def bias(n): return 107 if n<1240 else 1131 if n<33900 else 32768
def run_cs(cs,gsubrs,lsubrs):
    pts=[];st=[];x=y=0;nst=[0];w=[False]
    def line(nx,ny):
        nonlocal x,y
        for k in range(21): pts.append((x+(nx-x)*k/20,y+(ny-y)*k/20))
        x,y=nx,ny
    def curve(a,b_,c,d,e,f):
        nonlocal x,y
        x0,y0=x,y;x1,y1=x0+a,y0+b_;x2,y2=x1+c,y1+d;x3,y3=x2+e,y2+f
        for k in range(21):
            t=k/20;mt=1-t
            pts.append((mt**3*x0+3*mt*mt*t*x1+3*mt*t*t*x2+t**3*x3,mt**3*y0+3*mt*mt*t*y1+3*mt*t*t*y2+t**3*y3))
        x,y=x3,y3
    def ex(cs):
        nonlocal x,y,st
        i=0
        while i<len(cs):
            b0=cs[i]
            if b0>=32 or b0==28:
                v,n=num_ops(cs,i);st.append(v);i+=n;continue
            i+=1
            if b0 in (1,3,18,23):
                nst[0]+=len(st)//2;st=[]
            elif b0 in (19,20):
                nst[0]+=len(st)//2;st=[];i+=(nst[0]+7)//8
            elif b0==21:
                st=st[-2:];x+=st[0];y+=st[1];st=[]
            elif b0==22: x+=st[-1];st=[]
            elif b0==4: y+=st[-1];st=[]
            elif b0==5:
                for j in range(0,len(st)-1,2): line(x+st[j],y+st[j+1])
                st=[]
            elif b0 in (6,7):
                h=b0==6
                for v in st:
                    line(x+v,y) if h else line(x,y+v); h=not h
                st=[]
            elif b0==8:
                for j in range(0,len(st)-5,6): curve(*st[j:j+6])
                st=[]
            elif b0==24:
                j=0
                while j+6<=len(st)-2: curve(*st[j:j+6]);j+=6
                line(x+st[j],y+st[j+1]);st=[]
            elif b0==25:
                j=0
                while j+2<=len(st)-6: line(x+st[j],y+st[j+1]);j+=2
                curve(*st[j:j+6]);st=[]
            elif b0 in (26,27):
                j=0;d1=0
                if len(st)%2: d1=st[0];j=1
                while j+4<=len(st):
                    if b0==26: curve(d1,st[j],st[j+1],st[j+2],0,st[j+3])
                    else: curve(st[j],d1,st[j+1],st[j+2],st[j+3],0)
                    d1=0;j+=4
                st=[]
            elif b0 in (30,31):
                h=b0==31;j=0
                while j+4<=len(st):
                    last=st[j+4] if len(st)-j==5 else 0
                    if h: curve(st[j],0,st[j+1],st[j+2],last,st[j+3])
                    else: curve(0,st[j],st[j+1],st[j+2],st[j+3],last)
                    h=not h;j+=4
                st=[]
            elif b0==10:
                k=int(st.pop())+bias(len(lsubrs));ex(lsubrs[k])
            elif b0==29:
                k=int(st.pop())+bias(len(gsubrs));ex(gsubrs[k])
            elif b0==11: return
            elif b0==14: return 'end'
            elif b0==12: i+=1;st=[]
    ex(cs)
    return pts
def art(pts,W=16,H=12):
    if not pts: return ['(boş)']
    xs=[p[0] for p in pts];ys=[p[1] for p in pts]
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    sc=max(x1-x0,(y1-y0)*W/H*0.5,1)
    g=[[' ']*W for _ in range(H)]
    for px,py in pts:
        c=int((px-x0)/(max(x1-x0,1))*(W-1)) ; r=int((y1-py)/(max(y1-y0,1))*(H-1))
        g[r][c]='#'
    return [''.join(r) for r in g]
res={}
ART={}
for num,(head,raw) in objs.items():
    if raw is None or b'/Type1C' not in head: continue
    d=data(num); hs=d[2]
    names,o=idx(d,hs); tops,o=idx(d,o); strs,o=idx(d,o); gsubrs,o=idx(d,o)
    top=dictparse(tops[0])
    chs,_=idx(d,top[17][0])
    lsubrs=[]
    if 18 in top:
        sz,po=top[18]; priv=dictparse(d[po:po+sz])
        if 19 in priv: lsubrs,_=idx(d,po+priv[19][0])
    enc=top.get(16,[0])[0]; codemap={}
    if enc>1:
        fmt=d[enc]&127;p=enc+1
        if fmt==0:
            n=d[p];p+=1
            for gi in range(n): codemap[d[p+gi]]=gi+1
        else:
            n=d[p];p+=1;gi=1
            for r in range(n):
                f,l=d[p],d[p+1];p+=2
                for c in range(f,f+l+1): codemap[c]=gi;gi+=1
    # find font dicts referencing this fontfile
    for fn,(fh,_) in objs.items():
        if re.search(rb'/FontFile3\s+%d 0 R'%num,fh):
            for f2,(h2,_) in objs.items():
                if re.search(rb'/FontDescriptor\s+%d 0 R'%fn,h2) and b'EdiF' in h2:
                    cm={}
                    enc_ref=re.search(rb'/Encoding\s*(\d+) 0 R',h2)
                    ed=objs[int(enc_ref.group(1))][0] if enc_ref else h2
                    dm=re.search(rb'/Differences\s*\[([^\]]*)\]',ed)
                    gnames=[]
                    cs_off=top.get(15,[0])[0]
                    # charset names
                    sids=[0];fmt=d[cs_off];pp=cs_off+1
                    while len(sids)<len(chs):
                        if fmt==0: sids.append(int.from_bytes(d[pp:pp+2],'big'));pp+=2
                        else:
                            first=int.from_bytes(d[pp:pp+2],'big'); nn=d[pp+2] if fmt==1 else int.from_bytes(d[pp+2:pp+4],'big'); pp+=3 if fmt==1 else 4
                            sids+=list(range(first,first+nn+1))
                    nm=lambda s_: '#%d'%s_ if s_<391 else strs[s_-391].decode('latin1')
                    name2gid={nm(s_):i for i,s_ in enumerate(sids[:len(chs)])}
                    if dm:
                        code=0
                        for t_ in re.findall(rb'\d+|/[^\s/\[\]]+',dm.group(1)):
                            if t_[:1]==b'/':
                                if t_[1:].decode() in name2gid: cm[code]=name2gid[t_[1:].decode()]
                                code+=1
                            else: code=int(t_)
                    else: cm=codemap
                    for c,gi in cm.items():
                        hsh=hashlib.md5(chs[gi]).hexdigest()[:8]
                        res['%d:%d'%(f2,c)]=hsh
                        if hsh not in ART: ART[hsh]=art(run_cs(chs[gi],gsubrs,lsubrs))
    pass
json.dump({'map':res,'art':ART},open(sys.argv[2],'w'),ensure_ascii=False)
print(len(res),len(ART))
