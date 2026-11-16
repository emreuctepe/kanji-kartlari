#!/usr/bin/env python3
"""jlN.txt desteleri: (1) furiganasız kanji kalmadı mı, (2) cümleler karisik.txt'teki metinle birebir mi, (3) 20 cümle mi."""
import re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
K = re.compile(r'[㐀-鿿豈-﫿々〆ヶ]')
want = {}; cur = None
for l in open(os.path.join(ROOT, 'tools/jlpt/karisik.txt'), encoding='utf-8'):
    l = l.rstrip('\n')
    if l.startswith('@ '): cur = l[2:]; want[cur] = []
    elif l.startswith('['): want[cur].append(l.split('] ', 1)[1])
ok = True
for n in sys.argv[1:] or sorted(want, key=lambda x: int(x[2:])):
    p = os.path.join(ROOT, 'tools/decks/%s.txt' % n)
    if not os.path.exists(p): continue
    got = []
    for l in open(p, encoding='utf-8'):
        m = re.match(r'^(\d+) (.*)$', l.rstrip('\n'))
        if not m: continue
        body = m.group(2)
        bare = re.sub(r'\{[^}]*\}', '', body)
        rest = re.sub(r'[㐀-鿿豈-﫿々〆ヶ]+\{[^}]*\}', '', body)
        if K.search(rest): print(n, m.group(1), 'furiganasız kanji:', rest); ok = False
        got.append(bare)
    if got != want[n]:
        ok = False
        for i, (a, b) in enumerate(zip(got, want[n])):
            if a != b: print(n, i + 1, 'FARK\n  txt:', a, '\n  src:', b)
        if len(got) != len(want[n]): print(n, 'cümle sayısı', len(got), '!=', len(want[n]))
print('tamam' if ok else 'HATA')
