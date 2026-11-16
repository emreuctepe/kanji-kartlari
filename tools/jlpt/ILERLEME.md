# JLPT destesi — ilerleme

Yarıda kesilirse buradan devam et. Her faz bitince işaretle (☑).

## Yapı (kullanıcı isteği, 2026-11-16)
- Ana listede "Ortak tekrar"dan hemen sonra, en başta: **JLPT** klasörü
- JLPT > **N5–N4** (sonra N3–N2 ve N1 gelecek)
- N5–N4 > desteler: her destede 20 cümle, karışık (N5/N4 ve bölümler karışık)
- Eksik cümleler (boşluklu soru, ★ sıralama, seçmeli) önce doğru cevapla tamamlanıp tam cümle yapılır
- Kaynak: ~/İndirilenler/JLPT/ — N5/N4 × V (文字・語彙), G (文法・読解), R (?), script (聴解 metni); her birinin "(1)" ikinci seti var
- Ara çıktı: `tools/jlpt/n5n4_cumleler.md` (ham tam cümleler, kaynağa göre) → sonra `tools/decks/jlNN.txt`

## Araçlar
- `tools/jlpt/pdftext.py` + `glyphs.py`/`label.py`: PDF'ten metin (Adobe-Japan1 CMap gerekir: adobe-type-tools/cmap-resources UniJIS-UTF32-H → scratchpad/cmap/). "(1)" dosyaları + script'ler metinli → `tools/jlpt/metin/*.txt` (rakamlar glif şeklinden çözüldü). Diğer V/G/R taranmış JPEG → sayfa görüntüsü okunarak.

## Fazlar
- [x] 1. PDF'leri oku, tam cümleleri md'ye yaz (dosya dosya; aşağıdaki tabloyu güncelle)
- [x] 2. Cümleleri karıştırıp 20'lik deste txt'lerine çevir (furigana, çeviri, kelime)
  - Dağılım SABİT: `tools/jlpt/karisik.txt` (760 cümle = 38 deste, jl1–jl38). Yeniden karıştırma!
  - Her deste `tools/decks/jlN.txt`, başlık `@ jlN N5–N4 · N`; biçim jl1.txt'teki gibi (// kaynak etiketi, furigana tüm kanjilerde, Türkçe ekler tireli, yalnız kanjili kelimeler, kelime destede ilk geçtiği cümlede).
  - Yazınca `python3 tools/build_decks.py` (decks.js'e ekler) ve aşağıdaki listeye işle.
  - Bitenler: jl1–jl38 (hepsi; 1926 kart)
- [x] 3. app.js: JLPT > N5–N4 iç içe klasör, Ortak tekrardan sonra (FOLDERS/PARENT/leaves; JLPT kendi kilit zinciri — ana destelerin kilidini etkilemez). Tarayıcıda denendi.
- [x] 4. Derle, tarayıcıda dene, commit + push

## Sonraki: N3–N2 ve N1
- PDF'ler ~/İndirilenler/JLPT/N3*, N2*, N1* (aynı yapı). Aynı akış: metin çıkar (tools/jlpt/*.py) → `n3n2_cumleler.md` → karıştır → `jlN…` id'leri; app.js'te JLPT klasörüne `makeFolder('jl32', 'N3–N2', …)` gibi yeni alt klasör ekle (şu an yalnız /^jl\d+$/ → N5–N4).

## Faz 1 — kaynak dosyalar
| Dosya | Sayfa | Durum |
|---|---|---|
| N5V.pdf | 10 | ☑ md'de (39) |
| N5V (1).pdf | 10 | ☑ md'de (40) |
| N5G.pdf | 9 | ☑ md'de (41) |
| N5G (1).pdf | 9 | ☑ md'de (37) |
| N5R.pdf | 8 | ☑ md'de (24) |
| N5R (1).pdf | 8 | ☑ md'de (20) |
| N5script.pdf | 8 | ☑ md'de (64) |
| N5script (1).pdf | 14 | ☑ md'de (80) |
| N4V.pdf | 11 | ☑ md'de (44) |
| N4V (1).pdf | 11 | ☑ md'de (41) |
| N4G.pdf | 9 | ☑ md'de (46) |
| N4G (1).pdf | 9 | ☑ md'de (39) |
| N4R.pdf | 8 | ☑ md'de (37) |
| N4R (1).pdf | 8 | ☑ md'de (33) |
| N4script.pdf | 10 | ☑ md'de (82) |
| N4script (1).pdf | 12 | ☑ md'de (95) |
