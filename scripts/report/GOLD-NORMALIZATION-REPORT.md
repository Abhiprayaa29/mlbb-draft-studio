# Gold Value Normalization — ScoreSight → Sponsor Edition

**Status: SELESAI & TERVERIFIKASI LIVE** — 14 Okt 2026

---

## 1. Masalah

- Gold >9,9k tampil salah/tanpa `K` di overlay Sponsor Edition (contoh historis: file berisi `34`, `10`, `116` padahal HUD `16,4K`, `10,5K`, `11,6K`).
- Gold <10k relatif aman (`9464` tertangkap utuh).

## 2. Akar masalah (3 lapis)

| Lapis | Masalah | Perbaikan |
|---|---|---|
| Config ScoreSight (utama) | Box Gold `type=0` (Number) membatasi karakter OCR ke `0-9` — koma & `K` dibuang engine → `11,6K`→`116`; crop rect sempit memotong teks `10,5K`→`10`; regex `^\d*$` menolak format ber-suffix | UI ScoreSight: Type=**Text** (`type:2`), Format custom `^\d{1,4}(?:[.,]\d)?[kKmM]?$`, rect diperlebar |
| Parser kami | `parseGold` menolak koma (`16,4k`→`null`) | Koma ≡ titik di `server/ocr/textNormalizer.js` & `server/scoresight/fileBridge.js` |
| Mode satuan | Tidak ada pembeda raw vs ribuan | `goldMode` (`raw`\|`thousands`), env `SCORESIGHT_GOLD_MODE`, default `raw` |

`fmtGold` (presentation layer, `src/lib/utils.js`) tidak bermasalah:
`18200→"18,2k"`, `10000→"10k"`, `9579→"9,6k"`, `34→"34"`, `null/invalid→"–"`. Tidak memutasi input; unit konversi hanya di boundary File Bridge.

## 3. Perubahan kode

- `server/scoresight/fileBridge.js` — `parseGold(text, goldMode)` (koma+titik, suffix k/K/m/M, mode thousands ×1000 hanya `<1000`); `goldMode` di bridge opts/configure/statusSnapshot; cache gold di-invalidasi saat mode berubah.
- `server/scoresight/config.js` — baca `SCORESIGHT_GOLD_MODE`; redacted ke UI.
- `server/index.js` — wire `goldMode` ke `createScoreSightBridge` + 2 titik `configure`.
- `server/ocr/textNormalizer.js` — regex gold `(?:[.,]\d)?`; `parseGold` normalisasi koma→titik.
- `.env.example` — dokumentasi `SCORESIGHT_GOLD_MODE=raw`.

## 4. Konfigurasi ScoreSight (via UI operator, di luar repo)

`Scoresight ML.json`: `Home Gold`/`Away Gold` → `type: 2` (Text),
`format_regex: ^\d{1,4}(?:[.,]\d)?[kKmM]?$`.
Backup lokal: `Scoresight ML.json.bak-gold-fix` (TIDAK di-commit — config pengguna).
Catatan: edit file JSON saat app jalan percuma — ScoreSight menimpa dari memori; wajib via UI.

## 5. Trace end-to-end live (14 Okt 2026)

```
File  : Home Gold.txt="18.2k"   Away Gold.txt="14.2k"   Time.txt="06:51"
parse : 18200 / 14200 (suffix-k; koma=titik bila ada)
bridge: status.values homeGold=18200 awayGold=14200 (running, mode=raw)
state : score.blue.gold=18200   score.red.gold=14200
DOM   : se-gold-blue="18,2k"  se-gold-red="14,2k"   (1080p & 720p identik)
timer : Time.txt → timeMs=411000 → matchTimer timeSource=scoresight
```

Bukti visual: `scripts/report/gold-final-verified-1080p.png`, `gold-trace-1920.png`, `gold-trace-720.png` (lokal, di-gitignore).

## 6. Hasil test

- `test:scoresight` 95/0 (termasuk: raw/thousands, koma `16,4k→16400`, k-dobel, ambigu `139`, timer sync, source priority)
- `test:server` 166/0 · `test:ocr` 34/0 · e2e `npm test` 121/0
- `npx vite build` OK · `data:validate` LULUS

## 7. Aturan yang dijaga

- Satuan state = gold mentah integer; konversi hanya di boundary bridge.
- `fmtGold` presentation saja.
- Mode default `raw` sesuai kontrak file ScoreSight; `thousands` eksplisit via env.
- Turret/lord/time tidak terpengaruh perubahan gold.
