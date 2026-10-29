(function () {
  'use strict';
  var APP = 'kanji-kartlari';
  var DECKS = window.DECK_DATA;
  var FIXES = ["1.8 九: きゅう→く", "2.11 人: にん→じん", "7.16 人: にん→じん", "9.8 人: にん→じん", "60.7 人: にん→じん", "60.10 人: にん→じん", "6.4 来: く→きた", "51.11 日: ひ→び", "51.15 日: ひ→び", "57.6 日: ひ→び", "60.19 日: ひ→び", "55.4 訳: わけ→やく", "5.5 一: いち→ひと", "5.12 間: あいだ→ま", "8.11 入: はい→い", "10.12 止: と→ど", "51.8 頃: ころ→ごろ", "57.6 頃: ころ→ごろ", "4.2 何も: なん→なに", "4.12 何も: なん→なに", "6.2 何か: なん→なに", "54.6 何も: なん→なに", "54.9 何が: なん→なに", "60.19 何も: なん→なに"];
  var EXTRA = window.EXTRA_DATA;

  // ---------- model ----------
  var WORDS = new Map(); // "word|reading" -> {w, r, m, decks:[]}
  var CARD = new Map();  // "deck/word|reading" -> card
  DECKS.forEach(function (d) {
    d.cards = d.words.map(function (x, i) {
      var gk = x[0] + '|' + x[1];
      var c = { deck: d, i: i, w: x[0], r: x[1], m: x[2], occ: x[3], gk: gk, ck: d.id + '/' + gk };
      CARD.set(c.ck, c);
      if (!WORDS.has(gk)) WORDS.set(gk, { w: x[0], r: x[1], m: x[2], decks: [] });
      WORDS.get(gk).decks.push(d.id);
      return c;
    });
  });

  // tüm kelimeler: her kelime bir kez, kendi (ilk) destesindeki kartıyla
  var ALL = { id: 'all', title: 'Tüm kelimeler', sents: [], cards: [] };
  WORDS.forEach(function (w, gk) { ALL.cards.push(CARD.get(w.decks[0] + '/' + gk)); });

  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var prefs = Object.assign({ ctx: true, shuffle: true }, lsGet('kk.prefs', {}));
  function savePrefs() { lsSet('kk.prefs', prefs); }

  // sessions: id -> {t0, k:[cardKey], e:[[dtMs, keyIndex, 1|0, responseMs]]}
  var sessions = new Map();
  var MAX_EVENTS = 2500;
  var cur = null;
  function newSession() {
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    cur = { id: id, t0: Date.now(), k: [], kidx: new Map(), e: [] };
  }
  newSession();

  // ---------- stats ----------
  var stats = new Map(); // gk -> {g, r, last, lastAt, firstAt, byDeck:{}}
  function allEvents() {
    var out = [];
    function push(s) {
      for (var i = 0; i < s.e.length; i++) {
        var e = s.e[i];
        out.push({ t: s.t0 + e[0], ck: s.k[e[1]], res: e[2], ms: e[3], x: e[4] === 1 });
      }
    }
    sessions.forEach(function (s, id) { if (id !== cur.id) push(s); });
    push(cur);
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  // eski 2年文法 desteleri (gr1–gr11) kalıp destelerine (gp1–gp9) bölündü; eski basışlar kelimenin yeni destesine sayılır
  function liveDeckId(deckId, gk) {
    if (!/^gr\d+$/.test(deckId) || !WORDS.has(gk)) return deckId;
    var ds = WORDS.get(gk).decks.filter(function (id) { return /^gp/.test(id); });
    return ds.length ? ds[0] : deckId;
  }
  function recompute() {
    stats = new Map();
    allEvents().forEach(function (ev) {
      var slash = ev.ck.indexOf('/');
      var gk = ev.ck.slice(slash + 1), deckId = liveDeckId(ev.ck.slice(0, slash), gk);
      var s = stats.get(gk);
      if (!s) { s = { g: 0, r: 0, last: null, lastAt: 0, firstAt: ev.t, byDeck: {} }; stats.set(gk, s); }
      var bd = s.byDeck[deckId] || (s.byDeck[deckId] = { g: 0, r: 0 });
      if (ev.res) { s.g++; bd.g++; } else { s.r++; bd.r++; }
      s.last = ev.res ? 'g' : 'r'; s.lastAt = ev.t;
    });
  }
  // green last answer only counts as learned once ✓ outnumber ✗; otherwise it is 'y' (kısmen)
  function status(gk) { var s = stats.get(gk); return !s ? 'n' : s.last === 'r' ? 'r' : (s.g > s.r ? 'g' : 'y'); }
  var STATUS_TR = { g: 'öğrendim', y: 'kısmen', r: 'öğrenemedim', n: 'yeni' };
  function deckCounts(d) {
    var c = { g: 0, y: 0, r: 0, n: 0, pg: 0, pr: 0 };
    d.cards.forEach(function (card) {
      c[status(card.gk)]++;
      var s = stats.get(card.gk);
      if (s && d.id === 'all') { c.pg += s.g; c.pr += s.r; }
      else if (s && s.byDeck[d.id]) { c.pg += s.byDeck[d.id].g; c.pr += s.byDeck[d.id].r; }
    });
    return c;
  }

  // ---------- storage ----------
  // her basış bu tarayıcının localStorage'ına yazılır; claude.ai hesabından taşınan eski oturumlar data/progress.js'te
  var store = { kind: 'local', ready: false };

  function localSave() {
    var all = lsGet('kk.sessions', {});
    all[cur.id] = { t0: cur.t0, k: cur.k, e: cur.e };
    if (!cur.e.length) delete all[cur.id];
    if (!lsSet('kk.sessions', all)) toast('Kayıt alanı doldu. JSON indirip yedek al.');
  }
  function markDirty() { localSave(); }
  function rotateIfNeeded() {
    if (cur.e.length >= MAX_EVENTS) {
      localSave();
      sessions.set(cur.id, { t0: cur.t0, k: cur.k, e: cur.e });
      newSession();
    }
  }
  function flushNow() { localSave(); }

  function initStore() {
    var all = lsGet('kk.sessions', {}), seed = window.SEED_SESSIONS || {};
    Object.keys(seed).forEach(function (id) { if (!all[id] || all[id].e.length < seed[id].e.length) all[id] = seed[id]; });
    Object.keys(all).forEach(function (id) { if (id !== cur.id) sessions.set(id, all[id]); });
    store.ready = true; recompute(); render();
  }

  // başka cihazdan indirilen JSON'un basışları: zaten olanlar (aynı an + aynı kelime) atlanır, kalanlar yeni bir oturum olur
  function importEvents(evs) {
    var have = new Set(allEvents().map(function (ev) { return ev.t + ' ' + ev.ck.slice(ev.ck.indexOf('/') + 1); }));
    var byTitle = {};
    DECKS.forEach(function (d) { byTitle[d.title] = d.id; });
    var add = [];
    evs.forEach(function (x) {
      var t = Date.parse(x && x.at), gk = x && x.word + '|' + x.reading;
      if (!t || !x.word || !x.reading || have.has(t + ' ' + gk)) return;
      have.add(t + ' ' + gk);
      var deckId = byTitle[x.deck] || (WORDS.has(gk) ? WORDS.get(gk).decks[0] : 'x');
      add.push({ t: t, ck: deckId + '/' + gk, res: x.result === 'green' ? 1 : 0, ms: x.ms || 0, x: x.extraShown ? 1 : 0 });
    });
    if (!add.length) return 0;
    add.sort(function (a, b) { return a.t - b.t; });
    var s = { t0: add[0].t, k: [], e: [] }, kidx = new Map();
    add.forEach(function (a) {
      var i = kidx.get(a.ck);
      if (i === undefined) { i = s.k.length; s.k.push(a.ck); kidx.set(a.ck, i); }
      s.e.push([a.t - s.t0, i, a.res, a.ms, a.x]);
    });
    var id = 'imp' + Date.now().toString(36);
    sessions.set(id, s);
    var all = lsGet('kk.sessions', {});
    all[id] = s;
    if (!lsSet('kk.sessions', all)) toast('Kayıt alanı doldu.');
    recompute();
    return add.length;
  }
  function importFile(f) {
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || !Array.isArray(data.events)) throw new Error('events yok');
      var n = importEvents(data.events);
      render();
      toast(n ? n + ' yeni basış eklendi' : 'Yeni basış yok; hepsi zaten bu cihazda');
    }).catch(function () { toast('Dosya okunamadı. Bu uygulamadan indirilen JSON dosyasını seç.'); });
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', flushNow);

  // ---------- recording ----------
  function record(card, res, ms, extraShown) {
    var idx = cur.kidx.get(card.ck);
    if (idx === undefined) { idx = cur.k.length; cur.k.push(card.ck); cur.kidx.set(card.ck, idx); }
    cur.e.push([Date.now() - cur.t0, idx, res ? 1 : 0, Math.min(Math.round(ms), 3600000), extraShown ? 1 : 0]);
    recompute(); markDirty(); rotateIfNeeded();
  }
  function unrecordLast() {
    if (!cur.e.length) return false;
    cur.e.pop(); recompute(); markDirty(); return true;
  }

  // ---------- rendering helpers ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sentenceHTML(g, a, b, furi) {
    var out = '', pos = 0;
    g.forEach(function (seg) {
      if (typeof seg === 'string') {
        var s = pos, e = pos + seg.length;
        var x1 = Math.max(s, Math.min(e, a)), x2 = Math.max(s, Math.min(e, b));
        out += esc(seg.slice(0, x1 - s));
        if (x2 > x1) out += '<mark>' + esc(seg.slice(x1 - s, x2 - s)) + '</mark>';
        out += esc(seg.slice(x2 - s));
        pos = e;
      } else {
        var base = seg[0], rt = seg[1], e2 = pos + base.length;
        var inner = furi ? '<ruby>' + esc(base) + '<rt>' + esc(rt) + '</rt></ruby>' : esc(base);
        out += (pos < b && e2 > a) ? '<mark>' + inner + '</mark>' : inner;
        pos = e2;
      }
    });
    return out.replace(/<\/mark><mark>/g, '');
  }
  function countsHTML(gk) {
    var s = stats.get(gk);
    if (!s) return '<span>Henüz çalışılmadı</span>';
    return '<span class="cg">✓ ' + s.g + '</span> · <span class="cr">✗ ' + s.r + '</span> · ' + (status(gk) === 'y' ? '<span class="cy">kısmen: ✓ sayısı ✗ sayısını geçince öğrenilmiş sayılır</span>' : 'son: ' + STATUS_TR[status(gk)]);
  }
  function barHTML(c, total) {
    var pg = total ? (c.g / total * 100) : 0, py = total ? (c.y / total * 100) : 0, pr = total ? (c.r / total * 100) : 0;
    return '<div class="bar" role="img" aria-label="' + c.g + ' öğrenildi, ' + c.y + ' kısmen, ' + c.r + ' öğrenilemedi, ' + c.n + ' yeni"><i class="bg" style="width:' + pg + '%"></i><i class="by" style="width:' + py + '%"></i><i class="br" style="width:' + pr + '%"></i></div>';
  }
  var toastTimer = null;
  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  // ---------- views ----------
  var app = document.getElementById('app');
  var view = { name: 'home' };
  function go(v) { view = v; render(); window.scrollTo(0, 0); }

  function render() {
    if (view.name === 'home') renderHome();
    else if (view.name === 'deck') renderDeck();
    else if (view.name === 'study') renderStudy();
    else if (view.name === 'done') renderDone();
    else if (view.name === 'review') renderReview();
  }

  function renderHome() {
    var tot = { g: 0, y: 0, r: 0, n: 0 }, presses = { g: 0, r: 0 };
    WORDS.forEach(function (w, gk) { tot[status(gk)]++; var s = stats.get(gk); if (s) { presses.g += s.g; presses.r += s.r; } });
    var loading = !store.ready;
    var h = '<div class="wrap">';
    h += '<h1><span class="jp">漢字の授業</span> · Kelime kartları</h1>';
    h += '<p class="sub">' + DECKS.length + ' bölüm · ' + WORDS.size + ' kelime · cümlelerdeki kanjili kelimeler</p>';
    h += '<div class="summary">' +
      '<div class="stat g"><b>' + (loading ? '…' : tot.g) + '</b><span>Öğrendim</span></div>' +
      '<div class="stat y"><b>' + (loading ? '…' : tot.y) + '</b><span>Kısmen</span></div>' +
      '<div class="stat r"><b>' + (loading ? '…' : tot.r) + '</b><span>Öğrenemedim</span></div>' +
      '<div class="stat"><b>' + (loading ? '…' : tot.n) + '</b><span>Yeni</span></div>' +
      '<div class="stat"><b>' + (loading ? '…' : (presses.g + presses.r)) + '</b><span>Toplam basış</span></div></div>';
    h += '<div class="toolbar">' +
      '<label class="toggle"><input type="checkbox" id="opt-shuffle"' + (prefs.shuffle ? ' checked' : '') + '> Karıştır</label>' +
      '<label class="toggle"><input type="checkbox" id="opt-ctx"' + (prefs.ctx ? ' checked' : '') + '> Ön yüzde cümle</label>' +
      '<span class="spacer"></span>' +
      '<button class="btn" id="dl">JSON indir</button>' +
      '<input type="file" id="ul-file" class="vh"><label class="btn" for="ul-file">JSON yükle</label></div>';
    h += '<div class="legend"><span><i class="dot g"></i>Öğrendim (son ✓, ✓ &gt; ✗)</span><span><i class="dot y"></i>Kısmen (son ✓, ✓ ≤ ✗)</span><span><i class="dot r"></i>Öğrenemedim</span><span><i class="dot n"></i>Yeni</span></div>';
    var rk = loading ? [] : reviewKeys();
    h += '<ul class="decks"><li><button class="deck" id="rev" style="border-color:var(--bad)"' + (rk.length ? '' : ' disabled') + '>' +
      '<span class="t">Ortak tekrar</span>' +
      '<span><span class="meta" style="display:block">' + (loading ? 'yükleniyor…' : 'Tüm destelerden en az ' + REV_MIN + ' kez kırmızı basılmış ve son cevabı kırmızı olan kelimeler · karışık · cevap kaydedilmez') + '</span></span>' +
      '<span class="n tnum">' + rk.length + ' kart</span></button></li></ul>';
    h += '<ul class="decks">';
    DECKS.concat([ALL]).forEach(function (d) {
      var c = deckCounts(d), total = d.cards.length;
      h += '<li><button class="deck" data-deck="' + d.id + '">' +
        '<span class="t">' + esc(d.title) + '</span>' +
        '<span>' + (d.p ? '<span class="pat">' + esc(d.p) + '</span>' : '') + barHTML(c, total) + '<span class="meta tnum" style="display:block">' +
        (loading ? 'yükleniyor…' : c.g + ' öğrendim · ' + c.y + ' kısmen · ' + c.r + ' öğrenemedim · ' + c.n + ' yeni') + '</span></span>' +
        '<span class="n tnum">' + total + ' kart</span></button></li>';
    });
    h += '</ul>';
    h += '<p class="storage">' + storageNote() + '<br>Ek örnek cümleler <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a>\'dan alındı (CC BY 2.0 FR); Türkçe çevirileri Claude yazdı. Bir kelimeye en az bir kez kırmızı bastıysan kartın arka yüzünde görünür.</p>';
    h += '</div>';
    app.innerHTML = h;
    var revBtn = document.getElementById('rev');
    if (revBtn) revBtn.addEventListener('click', startReview);
    app.querySelectorAll('.deck[data-deck]').forEach(function (b) {
      b.addEventListener('click', function () { go({ name: 'deck', deck: deckById(b.dataset.deck) }); });
    });
    document.getElementById('opt-shuffle').addEventListener('change', function (e) { prefs.shuffle = e.target.checked; savePrefs(); });
    document.getElementById('opt-ctx').addEventListener('change', function (e) { prefs.ctx = e.target.checked; savePrefs(); });
    document.getElementById('dl').addEventListener('click', downloadJSON);
    var ul = document.getElementById('ul-file');
    ul.addEventListener('change', function () { if (ul.files[0]) importFile(ul.files[0]); ul.value = ''; });
  }
  function storageNote() {
    if (!store.ready) return 'İlerleme yükleniyor…';
    return 'Her basış bu tarayıcıda saklanıyor. Başka cihaza taşımak için burada JSON indir, orada JSON yükle; aynı basışlar iki kez sayılmaz. Kart durumu kelimenin son cevabıdır, bir kelime birden çok bölümde geçiyorsa durumu hepsinde ortaktır.';
  }
  function deckById(id) { if (id === 'all') return ALL; for (var i = 0; i < DECKS.length; i++) if (DECKS[i].id === id) return DECKS[i]; return null; }

  function renderDeck() {
    var d = view.deck, c = deckCounts(d);
    var due = d.cards.filter(function (card) { return status(card.gk) !== 'g'; });
    var h = '<div class="wrap">';
    h += '<button class="back" id="back">← Bölümler</button>';
    h += '<div class="deckhead"><h1>' + esc(d.title) + '</h1><span class="muted tnum">' + d.cards.length + ' kart · ' + (d.id === 'all' ? DECKS.length + ' desteden' : d.sents.length + ' cümle') + '</span>' + (d.p ? '<span class="pat">' + esc(d.p) + '</span>' : '') + '</div>';
    h += '<div style="margin-top:.8rem">' + barHTML(c, d.cards.length) + '</div>';
    h += '<p class="sub tnum" style="margin-top:.4rem">' + c.g + ' öğrendim · ' + c.y + ' kısmen · ' + c.r + ' öğrenemedim · ' + c.n + ' yeni · bu destede ' + c.pg + ' yeşil, ' + c.pr + ' kırmızı basış</p>';
    h += '<div class="actions">' +
      '<button class="btn primary" id="study-due"' + (due.length ? '' : ' disabled') + '>Çalış · ' + due.length + ' kart</button>' +
      '<button class="btn" id="study-all">Hepsini çalış · ' + d.cards.length + '</button>' +
      (c.r ? '<button class="btn" id="study-red">Sadece kırmızılar · ' + c.r + '</button>' : '') + '</div>';
    h += '<ul class="words">';
    d.cards.forEach(function (card) {
      var st = status(card.gk), s = stats.get(card.gk);
      h += '<li><i class="dot ' + st + '"></i><span><span class="w">' + esc(card.w) + '</span><span class="r">' + esc(card.r) + '</span><span class="m">' + esc(card.m) + '</span></span>' +
        '<span class="c">' + (s ? '<span class="cg">✓' + s.g + '</span><span class="cr">✗' + s.r + '</span>' : '') + '</span></li>';
    });
    h += '</ul></div>';
    app.innerHTML = h;
    document.getElementById('back').addEventListener('click', function () { go({ name: 'home' }); });
    document.getElementById('study-due').addEventListener('click', function () { startRound(d, due); });
    document.getElementById('study-all').addEventListener('click', function () { startRound(d, d.cards.slice()); });
    var red = document.getElementById('study-red');
    if (red) red.addEventListener('click', function () { startRound(d, d.cards.filter(function (x) { return status(x.gk) === 'r'; })); });
  }

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function startRound(d, cards) {
    if (!cards.length) return;
    var q = cards.slice();
    if (prefs.shuffle) shuffle(q);
    go({ name: 'study', deck: d, queue: q, pos: 0, flipped: false, shownAt: Date.now(), hist: [], g: 0, r: 0, missed: [] });
  }

  // kelimenin geçtiği tüm cümleler: önce kartın kendi destesi, sonra diğer desteler; ilk EX_OPEN açık, kalanı katlanır
  var EX_OPEN = 5;
  function exsHTML(card) {
    var list = [];
    [card.deck.id].concat(WORDS.get(card.gk).decks.filter(function (id) { return id !== card.deck.id; })).forEach(function (id) {
      var c = CARD.get(id + '/' + card.gk);
      c.occ.forEach(function (oc) { list.push({ d: c.deck, oc: oc }); });
    });
    var one = function (x) {
      var s = x.d.sents[x.oc[0]];
      return '<div class="ex"><div class="no">' + esc(x.d.title) + ' · ' + s.n + '. cümle' + (x.d === card.deck ? '' : ' · diğer deste') + '</div><p class="ja" lang="ja">' + sentenceHTML(s.g, x.oc[1], x.oc[2], true) + '</p><p class="tr">' + esc(s.t) + '</p></div>';
    };
    var h = '<div class="exs">' + (list.length > 1 ? '<div class="exn">' + list.length + ' cümlede geçiyor</div>' : '');
    h += list.slice(0, EX_OPEN).map(one).join('');
    if (list.length > EX_OPEN) h += '<details class="more"><summary>' + (list.length - EX_OPEN) + ' cümle daha göster</summary>' + list.slice(EX_OPEN).map(one).join('') + '</details>';
    return h + '</div>';
  }
  function renderStudy() {
    var v = view, d0 = v.deck, card = v.queue[v.pos], d = card.deck;
    var o = card.occ[0];
    var h = '<div class="study">';
    h += '<div class="studytop"><button class="iconbtn" id="quit" aria-label="Desteye dön">✕</button>' +
      '<span class="title">' + esc(d0.title) + '</span><span class="muted tnum">' + (v.pos + 1) + ' / ' + v.queue.length + '</span>' +
      '<span class="spacer"></span><span class="tally"><span class="g">✓ ' + v.g + '</span><span class="r">✗ ' + v.r + '</span></span>' +
      '<button class="iconbtn" id="undo"' + (v.hist.length ? '' : ' disabled') + ' title="Son cevabı geri al">↶ Geri al</button></div>';
    h += '<div class="progress"><i style="width:' + (v.pos / v.queue.length * 100) + '%"></i></div>';
    h += '<div class="card' + (v.flipped ? ' revealed' : '') + '" id="card"' + (v.flipped ? '' : ' role="button" tabindex="0" aria-label="Cevabı göster"') + '>';
    h += '<div class="front"><div class="bigword" lang="ja">' + esc(card.w) + '</div>';
    if (!v.flipped) {
      if (prefs.ctx) h += '<div class="ctx" lang="ja">' + sentenceHTML(d.sents[o[0]].g, o[1], o[2], false) + '</div>';
      h += '<div class="hint">Okunuşu ve anlamı düşün, sonra kartı çevir</div>';
    } else {
      h += '<div class="answer"><div class="reading" lang="ja">' + esc(card.r) + '</div><div class="meaning">' + esc(card.m) + '</div>' +
        '<div class="counts">' + countsHTML(card.gk) + '</div></div>';
    }
    h += '</div>';
    if (v.flipped) {
      h += exsHTML(card);
      var st = stats.get(card.gk), ex = EXTRA[card.gk];
      v.extraShown = !!(ex && st && st.r > 0);
      if (v.extraShown) {
        h += '<div class="extra"><div class="no"><span>Ek örnek · daha önce kırmızı bastığın için</span>' +
          '<a href="https://tatoeba.org/tr/sentences/show/' + encodeURIComponent(ex.id) + '" target="_blank" rel="noopener">Tatoeba #' + esc(ex.id) + '</a></div>' +
          '<p class="ja" lang="ja">' + sentenceHTML(ex.g, ex.h[0], ex.h[1], true) + '</p><p class="tr">' + esc(ex.t) + '</p></div>';
      }
    }
    h += '</div>';
    if (!v.flipped) {
      h += '<div class="answerbar one"><button class="big reveal" id="reveal">Cevabı göster<small class="kbd">Boşluk</small></button></div>';
    } else {
      h += '<div class="answerbar"><button class="big good" id="yes">✓ Öğrendim<small class="kbd">1 veya ←</small></button>' +
        '<button class="big bad" id="no">✗ Öğrenemedim<small class="kbd">2 veya →</small></button></div>';
    }
    h += '</div>';
    app.innerHTML = h;
    document.getElementById('quit').addEventListener('click', endRoundEarly);
    document.getElementById('undo').addEventListener('click', undo);
    if (!v.flipped) {
      document.getElementById('card').addEventListener('click', flip);
      document.getElementById('reveal').addEventListener('click', flip);
    } else {
      document.getElementById('no').addEventListener('click', function () { answer(false); });
      document.getElementById('yes').addEventListener('click', function () { answer(true); });
    }
  }
  // ---------- ortak tekrar (salt okunur) ----------
  var REV_MIN = 5;
  function reviewKeys() {
    var out = [];
    WORDS.forEach(function (w, gk) { var s = stats.get(gk); if (s && s.r >= REV_MIN && status(gk) === 'r') out.push(gk); });
    return out;
  }
  function startReview() {
    var ks = shuffle(reviewKeys());
    if (!ks.length) return;
    go({ name: 'review', queue: ks.map(function (gk) { return CARD.get(WORDS.get(gk).decks[0] + '/' + gk); }), pos: 0, flipped: false });
  }
  function renderReview() {
    var v = view, card = v.queue[v.pos], d = card.deck, o = card.occ[0], s = stats.get(card.gk);
    var homes = WORDS.get(card.gk).decks.map(function (id) { return deckById(id).title; }).join(', ');
    var h = '<div class="study">';
    h += '<div class="studytop"><button class="iconbtn" id="rquit" aria-label="Bölümlere dön">✕</button>' +
      '<span class="title">Ortak tekrar</span><span class="muted tnum">' + (v.pos + 1) + ' / ' + v.queue.length + '</span>' +
      '<span class="spacer"></span><span class="tally"><span class="r">✗ ' + (s ? s.r : 0) + '</span></span></div>';
    h += '<div class="progress"><i style="width:' + (v.pos / v.queue.length * 100) + '%"></i></div>';
    h += '<div class="card' + (v.flipped ? ' revealed' : '') + '" id="rcard"' + (v.flipped ? '' : ' role="button" tabindex="0" aria-label="Cevabı göster"') + '>';
    h += '<div class="front"><div class="bigword" lang="ja">' + esc(card.w) + '</div>';
    if (!v.flipped) {
      if (prefs.ctx) h += '<div class="ctx" lang="ja">' + sentenceHTML(d.sents[o[0]].g, o[1], o[2], false) + '</div>';
      h += '<div class="hint">Okunuşu ve anlamı düşün, sonra kartı çevir</div>';
    } else {
      h += '<div class="answer"><div class="reading" lang="ja">' + esc(card.r) + '</div><div class="meaning">' + esc(card.m) + '</div>' +
        '<div class="counts">' + countsHTML(card.gk) + '<br><span>Deste: ' + esc(homes) + ' · çıkarmak için orada çalış</span></div></div>';
    }
    h += '</div>';
    if (v.flipped) {
      h += exsHTML(card);
      var ex = EXTRA[card.gk];
      if (ex) {
        h += '<div class="extra"><div class="no"><span>Ek örnek</span>' +
          '<a href="https://tatoeba.org/tr/sentences/show/' + encodeURIComponent(ex.id) + '" target="_blank" rel="noopener">Tatoeba #' + esc(ex.id) + '</a></div>' +
          '<p class="ja" lang="ja">' + sentenceHTML(ex.g, ex.h[0], ex.h[1], true) + '</p><p class="tr">' + esc(ex.t) + '</p></div>';
      }
    }
    h += '</div>';
    var last = v.pos + 1 >= v.queue.length;
    h += '<div class="answerbar one">' + (v.flipped
      ? '<button class="big reveal" id="rnext">' + (last ? 'Bitir' : 'Sonraki →') + '<small class="kbd">Boşluk</small></button>'
      : '<button class="big reveal" id="rreveal">Cevabı göster<small class="kbd">Boşluk</small></button>') + '</div>';
    h += '</div>';
    app.innerHTML = h;
    document.getElementById('rquit').addEventListener('click', function () { go({ name: 'home' }); });
    if (!v.flipped) {
      document.getElementById('rcard').addEventListener('click', revFlip);
      document.getElementById('rreveal').addEventListener('click', revFlip);
    } else {
      document.getElementById('rnext').addEventListener('click', revNext);
    }
  }
  function revFlip() { if (view.name !== 'review' || view.flipped) return; view.flipped = true; renderReview(); }
  function revNext() {
    var v = view; if (v.name !== 'review') return;
    if (v.pos + 1 >= v.queue.length) { go({ name: 'home' }); toast('Ortak tekrar bitti'); return; }
    v.pos++; v.flipped = false; renderReview(); window.scrollTo(0, 0);
  }

  function flip() {
    if (view.name !== 'study' || view.flipped) return;
    view.flipped = true; view.flippedAt = Date.now(); renderStudy();
    var yes = document.getElementById('yes'); if (yes) yes.focus({ preventScroll: true });
  }
  function answer(ok) {
    var v = view; if (v.name !== 'study' || !v.flipped) return;
    var card = v.queue[v.pos];
    record(card, ok, Date.now() - v.shownAt, v.extraShown);
    v.hist.push({ pos: v.pos, ok: ok });
    if (ok) v.g++; else { v.r++; v.missed.push(card); }
    v.pos++; v.flipped = false; v.shownAt = Date.now();
    if (v.pos >= v.queue.length) { flushNow(); go({ name: 'done', deck: v.deck, g: v.g, r: v.r, missed: v.missed, total: v.queue.length }); return; }
    renderStudy(); window.scrollTo(0, 0);
  }
  function undo() {
    var v = view; if (v.name !== 'study' || !v.hist.length) return;
    var last = v.hist.pop();
    unrecordLast();
    if (last.ok) v.g--; else { v.r--; v.missed.pop(); }
    v.pos = last.pos; v.flipped = true; v.shownAt = Date.now();
    renderStudy(); toast('Son cevap geri alındı');
  }
  function endRoundEarly() {
    var v = view; flushNow();
    if (v.hist.length) go({ name: 'done', deck: v.deck, g: v.g, r: v.r, missed: v.missed, total: v.hist.length, early: true });
    else go({ name: 'deck', deck: v.deck });
  }

  function renderDone() {
    var v = view, d = v.deck;
    var h = '<div class="wrap"><div class="done">';
    h += '<p class="muted">' + esc(d.title) + (v.early ? ' · tur yarıda bırakıldı' : ' · tur bitti') + '</p>';
    h += '<div class="big-n"><span class="g">✓ ' + v.g + '</span> &nbsp; <span class="r">✗ ' + v.r + '</span></div>';
    h += '<p class="muted tnum">' + v.total + ' kartın ' + v.g + ' tanesini öğrendin</p>';
    h += '<div class="actions">' +
      (v.missed.length ? '<button class="btn primary" id="again">Öğrenemediklerimi tekrar çalış · ' + v.missed.length + '</button>' : '') +
      '<button class="btn" id="todeck">Desteye dön</button><button class="btn" id="tohome">Bölümler</button></div>';
    h += '</div>';
    if (v.missed.length) {
      h += '<div class="missed"><p class="sub">Bu turda öğrenemediklerin</p><ul class="words">';
      v.missed.forEach(function (card) {
        h += '<li><i class="dot r"></i><span><span class="w">' + esc(card.w) + '</span><span class="r">' + esc(card.r) + '</span><span class="m">' + esc(card.m) + '</span></span><span></span></li>';
      });
      h += '</ul></div>';
    }
    h += '</div>';
    app.innerHTML = h;
    var again = document.getElementById('again');
    if (again) again.addEventListener('click', function () { startRound(d, v.missed); });
    document.getElementById('todeck').addEventListener('click', function () { go({ name: 'deck', deck: d }); });
    document.getElementById('tohome').addEventListener('click', function () { go({ name: 'home' }); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (view.name === 'review') {
      var rk2 = e.key;
      if (rk2 === ' ' || rk2 === 'Enter' || rk2 === 'ArrowRight') { e.preventDefault(); if (!view.flipped) revFlip(); else revNext(); }
      else if (rk2 === 'Escape') go({ name: 'home' });
      return;
    }
    if (view.name !== 'study') return;
    var k = e.key;
    if (!view.flipped && (k === ' ' || k === 'Enter')) { e.preventDefault(); flip(); }
    else if (view.flipped && (k === '1' || k === 'ArrowLeft')) { e.preventDefault(); answer(true); }
    else if (view.flipped && (k === '2' || k === 'ArrowRight')) { e.preventDefault(); answer(false); }
    else if (k === 'z' || k === 'Z' || k === 'Backspace') { e.preventDefault(); undo(); }
    else if (k === 'Escape') { endRoundEarly(); }
  });

  // ---------- export ----------
  function iso(t) { return new Date(t).toISOString(); }
  function buildExport() {
    recompute();
    var evs = allEvents();
    var words = [];
    var tot = { g: 0, y: 0, r: 0, n: 0 };
    WORDS.forEach(function (w, gk) {
      var s = stats.get(gk);
      tot[status(gk)]++;
      words.push({
        word: w.w, reading: w.r, meaning: w.m, decks: w.decks.map(function (id) { return deckById(id).title; }),
        status: STATUS_TR[status(gk)],
        extraSentence: EXTRA[gk] ? 'tatoeba:' + EXTRA[gk].id : null,
        green: s ? s.g : 0, red: s ? s.r : 0,
        firstAt: s ? iso(s.firstAt) : null, lastAt: s ? iso(s.lastAt) : null,
        byDeck: s ? Object.keys(s.byDeck).reduce(function (o, id) { var x = deckById(id); o[x ? x.title : id] = { green: s.byDeck[id].g, red: s.byDeck[id].r }; return o; }, {}) : {}
      });
    });
    var days = {};
    function localDay(t) { var x = new Date(t); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
    evs.forEach(function (ev) { var day = localDay(ev.t); days[day] = days[day] || { green: 0, red: 0 }; days[day][ev.res ? 'green' : 'red']++; });
    return {
      app: '漢字の授業 214–342 · kelime kartları',
      exportedAt: new Date().toISOString(),
      timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })(),
      storage: 'tarayıcı',
      notes: 'status = kelimenin son cevabı (kırmızı=öğrenemedim; yeşil ise toplam yeşil > toplam kırmızı → öğrendim, değilse kısmen). Aynı kelime birden çok bölümde geçiyorsa sayaçlar kelime başına toplanır, byDeck bölüm kırılımını verir. events[].ms = kart gösterildikten cevaba kadar geçen süre. events[].extraShown = cevap verilirken kartta Tatoeba ek cümlesi görünüyordu (yalnızca daha önce kırmızı basılmış kelimelerde gösterilir).',
      summary: {
        words: WORDS.size, cards: CARD.size, learned: tot.g, partial: tot.y, notLearned: tot.r, new: tot.n,
        greenPresses: evs.filter(function (e) { return e.res; }).length,
        redPresses: evs.filter(function (e) { return !e.res; }).length,
        firstActivity: evs.length ? iso(evs[0].t) : null,
        lastActivity: evs.length ? iso(evs[evs.length - 1].t) : null,
        byDay: days
      },
      decks: DECKS.map(function (d) {
        var c = deckCounts(d);
        return { id: d.id, title: d.title, cards: d.cards.length, learned: c.g, partial: c.y, notLearned: c.r, new: c.n, greenPresses: c.pg, redPresses: c.pr };
      }),
      words: words,
      events: evs.map(function (ev) {
        var slash = ev.ck.indexOf('/'), gk = ev.ck.slice(slash + 1), d = deckById(liveDeckId(ev.ck.slice(0, slash), gk)), bar = gk.indexOf('|');
        return { at: iso(ev.t), deck: d ? d.title : ev.ck.slice(0, slash), word: gk.slice(0, bar), reading: gk.slice(bar + 1), result: ev.res ? 'green' : 'red', ms: ev.ms, extraShown: !!ev.x };
      }),
      furiganaFixes: FIXES
    };
  }
  function downloadJSON() {
    var data = JSON.stringify(buildExport(), null, 2);
    var name = 'kanji-kartlari-' + new Date().toISOString().slice(0, 10) + '.json';
    // telefonda paylaşım menüsü (Dosyalar'a kaydet, AirDrop, mesaj…); ana ekran uygulamasında indirme bağlantısı takılabiliyor
    var file = typeof File === 'function' ? new File([data], name, { type: 'application/json' }) : null;
    if (file && matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(function () { toast('JSON paylaşıldı'); }, function (e) {
        if (!e || e.name !== 'AbortError') saveBlob(data, name);
      });
      return;
    }
    saveBlob(data, name);
  }
  function saveBlob(data, name) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      toast('JSON indirildi');
    } catch (e) { showJson(data); }
  }
  function showJson(data) {
    var el = document.createElement('div');
    el.className = 'sheet';
    el.innerHTML = '<div class="panel" role="dialog" aria-label="JSON verisi"><strong>JSON verisi</strong><p class="sub">Bu görünümde dosya indirilemedi. Metni kopyalayıp bir .json dosyasına yapıştırabilirsin.</p><textarea id="json-text" readonly></textarea><div class="actions" style="margin:0"><button class="btn primary" id="json-copy">Kopyala</button><button class="btn" id="json-close">Kapat</button></div></div>';
    document.body.appendChild(el);
    var ta = el.querySelector('#json-text'); ta.value = data;
    el.querySelector('#json-close').addEventListener('click', function () { el.remove(); });
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
    el.querySelector('#json-copy').addEventListener('click', function () {
      var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(data) : Promise.reject();
      p.then(function () { toast('Kopyalandı'); }, function () { ta.focus(); ta.select(); toast('Metin seçildi, kopyalayabilirsin'); });
    });
  }

  recompute();
  render();
  initStore();
})();
