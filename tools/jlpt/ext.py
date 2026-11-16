import sys,re,os
src,out,minw=sys.argv[1],sys.argv[2],int(sys.argv[3]) if len(sys.argv)>3 else 900
b=open(src,'rb').read(); os.makedirs(out,exist_ok=True); n=0
for m in re.finditer(rb'(\d+) 0 obj',b):
    s=b.find(b'stream',m.end()); 
    if s<0: continue
    head=b[m.end():s]
    if b'endobj' in head or b'DCTDecode' not in head: continue
    w=re.search(rb'/Width (\d+)',head)
    if not w or int(w.group(1))<minw: continue
    st=s+6
    if b[st:st+2]==b'\r\n': st+=2
    elif b[st:st+1]==b'\n': st+=1
    e=b.find(b'endstream',st)
    n+=1; open(os.path.join(out,'%03d_obj%s.jpg'%(n,m.group(1).decode())),'wb').write(b[st:e].rstrip(b'\r\n'))
print(src,n)
