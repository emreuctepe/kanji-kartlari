#!/usr/bin/env python3
"""tools/decks/*.txt kaynaklarından desteleri derleyip data/decks.js'e ekler (aynı id varsa yerine koyar).

Kaynak biçimi:
  @ 14 第14回                      deste: id ve başlık
  1 先週{せんしゅう}ある会社{かいしゃ}…   cümle; 漢字{よみ} = furigana (okunuş, hemen önündeki kanji dizisine ait)
  = Türkçe çeviri
  + 受ける|うける|almak; girmek|受け   kelime: sözlük biçimi|okunuş|anlam|cümledeki yazılışı (yoksa sözlük biçimi)
                                     aynı yazılış cümlede birden çok geçiyorsa sonuna #2, #3 …
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KANJI = re.compile(r'[㐀-鿿豈-﫿々〆ヶ]')


def parse_ruby(src):
    g, buf, i = [], '', 0
    while i < len(src):
        ch = src[i]
        if ch == '{':
            j = src.index('}', i)
            k = len(buf)
            while k > 0 and KANJI.match(buf[k - 1]):
                k -= 1
            if k == len(buf):
                raise ValueError('furigananın önünde kanji yok: ' + src[:i + 1])
            if buf[:k]:
                g.append(buf[:k])
            g.append([buf[k:], src[i + 1:j]])
            buf, i = '', j + 1
        else:
            buf += ch
            i += 1
    if buf:
        g.append(buf)
    return g


def plain(g):
    return ''.join(x if isinstance(x, str) else x[0] for x in g)


def build(path):
    decks, d, s = [], None, None
    for ln, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('//'):
            continue
        try:
            if line.startswith('@ '):
                _, did, title = line.split(' ', 2)
                d = {'id': did, 'title': title, 'sents': [], 'words': [], '_w': {}}
                decks.append(d)
            elif line.startswith('= '):
                s['t'] = line[2:].strip()
            elif line.startswith('+ '):
                parts = line[2:].split('|')
                w, r, m = parts[0].strip(), parts[1].strip(), parts[2].strip()
                surf = parts[3].strip() if len(parts) > 3 and parts[3].strip() else w
                nth = 1
                if '#' in surf:
                    surf, nth = surf.split('#'); nth = int(nth)
                text, si = s['_p'], len(d['sents']) - 1
                pos = -1
                for _ in range(nth):
                    pos = text.find(surf, pos + 1)
                    if pos < 0:
                        raise ValueError('cümlede yok: ' + surf)
                key = w + '|' + r
                if key not in d['_w']:
                    d['_w'][key] = [w, r, m, []]
                    d['words'].append(d['_w'][key])
                d['_w'][key][3].append([si, pos, pos + len(surf)])
            else:
                n, body = line.split(' ', 1)
                g = parse_ruby(body.strip())
                s = {'n': int(n), 'g': g, '_p': plain(g)}
                d['sents'].append(s)
        except Exception as e:
            sys.exit('%s:%d: %s\n  %s' % (path, ln, e, line))
    for d in decks:
        del d['_w']
        for s in d['sents']:
            if 't' not in s:
                sys.exit('%s: %s %d. cümlenin çevirisi yok' % (path, d['title'], s['n']))
            del s['_p']
    return decks


def order(did):
    m = re.match(r'^\d+$', did)
    return (0, int(did)) if m else (1, 0)


def main():
    src_dir = os.path.join(ROOT, 'tools', 'decks')
    new = []
    for f in sorted(os.listdir(src_dir)):
        if f.endswith('.txt'):
            new += build(os.path.join(src_dir, f))
    out = os.path.join(ROOT, 'data', 'decks.js')
    txt = open(out, encoding='utf-8').read()
    pre = 'window.DECK_DATA = '
    decks = json.loads(txt[len(pre):].rstrip().rstrip(';'))
    # aynı id varsa yerinde değiştir; yeni numaralı deste (第N回) numara sırasına, diğerleri sona
    for nd in new:
        at = next((i for i, d in enumerate(decks) if d['id'] == nd['id']), None)
        if at is not None:
            decks[at] = nd
        elif order(nd['id'])[0] == 0:
            n = order(nd['id'])[1]
            at = 0
            for i, d in enumerate(decks):
                if order(d['id'])[0] == 0 and order(d['id'])[1] < n:
                    at = i + 1
            decks.insert(at, nd)
        else:
            decks.append(nd)
    open(out, 'w', encoding='utf-8').write(pre + json.dumps(decks, ensure_ascii=False, separators=(',', ':')) + ';\n')
    for d in new:
        print('%s: %d cümle, %d kelime' % (d['title'], len(d['sents']), len(d['words'])))


if __name__ == '__main__':
    main()
