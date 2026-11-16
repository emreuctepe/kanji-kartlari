import json,re,sys,collections
L=dict(x.split('=') for x in "25ca7226=2 2a29ed9a=7 5d4c6c53=3 69986303=6 6fac68c7=7 7da91708=5 822635be=2 87f84a97=0 8fe30d97=8 97756329=4 9f5cd281=3 b0fb73fc=0 b6274785=9 c5623065=5 d206c37a=1 d6feecdd=8 d98ad280=4 f4cb2fd2=1 f8ecd8d5=1 c0a2e041=0 d7efdda8=8 fa901daa=9 614f0f94= af2fe885= 0daffc9b=○ 50d64f56=● c25d8877=".split())
g=json.load(open(sys.argv[1]))['map']
t=open(sys.argv[2]).read()
def rep(m):
    h=g.get(m.group(1),'??')
    return L.get(h,'⟦'+h+'⟧')
print(re.sub(r'⟦(\d+:\d+)⟧',rep,t))
