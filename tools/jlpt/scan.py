import sys,re,zlib
b=open(sys.argv[1],'rb').read()
for m in re.finditer(rb'(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n',b,re.S):
    d=m.group(2)
    if b'Image' in d or b'XObject' in d:
        print(m.group(1).decode(), d[:200].replace(b'\r',b' ').replace(b'\n',b' '))
print('objstm',len(re.findall(rb'/ObjStm',b)))
